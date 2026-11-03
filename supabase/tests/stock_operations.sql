-- Local single-session PostgreSQL checks. These do NOT prove concurrent locking.
begin;
select set_config('stockmate.stock.a', gen_random_uuid()::text, true);
select set_config('stockmate.stock.b', gen_random_uuid()::text, true);
insert into auth.users(id,email) values
 (current_setting('stockmate.stock.a')::uuid, 'stock-a@example.invalid'),
 (current_setting('stockmate.stock.b')::uuid, 'stock-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('stockmate.stock.a'), true);
select set_config('request.jwt.claims', json_build_object('sub',current_setting('stockmate.stock.a'),'role','authenticated')::text, true);

do $$
declare
  product public.products;
  other_product public.products;
  receipt public.stock_movements;
  replay public.stock_movements;
  step jsonb;
  bad jsonb;
  request_id uuid;
  shared_id uuid := gen_random_uuid();
  before_row jsonb;
  before_history jsonb;
  before_count bigint;
  before_operations bigint;
  expected_code text;
  received_code text;
begin
  if current_user <> 'authenticated' then raise exception 'FAIL: test role is elevated'; end if;
  if has_column_privilege('authenticated','public.products','quantity','UPDATE')
    or has_column_privilege('authenticated','public.products','user_id','UPDATE')
    or has_table_privilege('authenticated','public.products','UPDATE')
    or has_table_privilege('authenticated','public.stock_movements','INSERT')
    or has_table_privilege('authenticated','public.stock_movements','UPDATE')
    or has_table_privilege('authenticated','public.stock_movements','DELETE')
    or has_table_privilege('authenticated','public.stock_operations','INSERT')
    or has_table_privilege('authenticated','public.stock_operations','UPDATE')
    or has_table_privilege('authenticated','public.stock_operations','DELETE')
    or has_table_privilege('authenticated','public.stock_operations','TRUNCATE') then
    raise exception 'FAIL: direct write restrictions changed';
  end if;
  product := public.create_product('Stock fixture','STOCK-1',null,'',10);
  perform set_config('stockmate.stock.product', product.id::text, true);
  other_product := public.create_product('Other fixture','STOCK-2',null,'',0);
  for step in select value from jsonb_array_elements('[
    {"type":"IN","quantity":5,"after":15,"delta":5},
    {"type":"OUT","quantity":3,"after":12,"delta":-3},
    {"type":"ADJUSTMENT","quantity":20,"after":20,"delta":8},
    {"type":"ADJUSTMENT","quantity":7,"after":7,"delta":-13},
    {"type":"ADJUSTMENT","quantity":0,"after":0,"delta":-7}
  ]'::jsonb) loop
    request_id := gen_random_uuid();
    select count(*) into before_count from public.stock_movements where product_id=product.id;
    receipt := public.change_stock(product.id,request_id,step->>'type',(step->>'quantity')::numeric,'Physical count verified');
    if receipt.quantity_after <> (step->>'after')::integer or receipt.quantity_change <> (step->>'delta')::integer
      or receipt.type <> step->>'type' or receipt.user_id <> auth.uid() then raise exception 'FAIL: movement semantics'; end if;
    if (select quantity from public.products where id=product.id) <> receipt.quantity_after
      or (select count(*) from public.stock_movements where product_id=product.id) <> before_count+1
      or (select movement_id from public.stock_operations where operation_id=request_id) <> receipt.id then
      raise exception 'FAIL: quantity, history or idempotency receipt mismatch';
    end if;
    select to_jsonb(p) into before_row from public.products p where id=product.id;
    replay := public.change_stock(product.id,request_id,step->>'type',(step->>'quantity')::numeric,'Physical count verified');
    if to_jsonb(replay) is distinct from to_jsonb(receipt)
      or (select count(*) from public.stock_movements where product_id=product.id) <> before_count+1
      or (select to_jsonb(p) from public.products p where id=product.id) is distinct from before_row then
      raise exception 'FAIL: identical retry applied twice or changed receipt';
    end if;
    -- Every request field is part of the UUID fingerprint.
    for bad in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('product',other_product.id,'type',step->>'type','quantity',step->>'quantity','note','Physical count verified'),
      jsonb_build_object('product',product.id,'type',case when step->>'type'='IN' then 'OUT' else 'IN' end,'quantity',1,'note','Physical count verified'),
      jsonb_build_object('product',product.id,'type',step->>'type','quantity',(step->>'quantity')::numeric+1,'note','Physical count verified'),
      jsonb_build_object('product',product.id,'type',step->>'type','quantity',step->>'quantity','note','Different note')
    )) loop
      begin
        perform public.change_stock((bad->>'product')::uuid,request_id,bad->>'type',(bad->>'quantity')::numeric,bad->>'note');
        raise exception 'FAIL: conflicting UUID reuse accepted';
      exception when sqlstate 'P1004' then null; end;
    end loop;
  end loop;

  receipt := public.change_stock(product.id,gen_random_uuid(),'IN',10,'Restock');
  select to_jsonb(p) into before_row from public.products p where id=product.id;
  select jsonb_agg(to_jsonb(m) order by id) into before_history from public.stock_movements m where product_id=product.id;
  select count(*) into before_operations from public.stock_operations;
  for bad in select value from jsonb_array_elements('[
    {"type":null,"quantity":1}, {"type":"INVALID","quantity":1}, {"type":"in","quantity":1},
    {"type":"IN","quantity":null}, {"type":"IN","quantity":1.5}, {"type":"OUT","quantity":-1},
    {"type":"IN","quantity":0}, {"type":"OUT","quantity":0},
    {"type":"ADJUSTMENT","quantity":-1}, {"type":"ADJUSTMENT","quantity":0.5},
    {"type":"IN","quantity":"NaN"}, {"type":"IN","quantity":"Infinity"},
    {"type":"OUT","quantity":"-Infinity"}, {"type":"IN","quantity":2147483648},
    {"type":"ADJUSTMENT","quantity":2147483648},
    {"type":"ADJUSTMENT","quantity":5,"note":""}, {"type":"ADJUSTMENT","quantity":5,"note":"  "},
    {"type":"ADJUSTMENT","quantity":5,"note":"ab"}, {"type":"ADJUSTMENT","quantity":5,"note":"!!!"},
    {"type":"IN","quantity":1,"note":null},
    {"type":"OUT","quantity":11,"code":"P1002"},
    {"type":"ADJUSTMENT","quantity":10,"code":"P1003"},
    {"type":"IN","quantity":2147483647,"code":"22003"}
  ]'::jsonb) loop
    expected_code := coalesce(bad->>'code','22023');
    received_code := null;
    begin
      perform public.change_stock(product.id,gen_random_uuid(),bad->>'type',(bad->>'quantity')::numeric,
        case when bad ? 'note' then bad->>'note' else 'Verified count' end);
    exception when others then get stacked diagnostics received_code = returned_sqlstate; end;
    if received_code is distinct from expected_code then raise exception 'FAIL: invalid input error code, expected %, received %',expected_code,received_code; end if;
    if (select to_jsonb(p) from public.products p where id=product.id) is distinct from before_row
      or (select jsonb_agg(to_jsonb(m) order by id) from public.stock_movements m where product_id=product.id) is distinct from before_history
      or (select count(*) from public.stock_operations) <> before_operations then raise exception 'FAIL: rejected request changed state'; end if;
  end loop;
  begin
    perform public.change_stock(product.id,null,'IN',1,'');
    raise exception 'FAIL: null operation UUID';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.change_stock(null,gen_random_uuid(),'IN',1,'');
    raise exception 'FAIL: null product UUID';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.change_stock(product.id,gen_random_uuid(),'IN',1,repeat('x',2001));
    raise exception 'FAIL: oversized note';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.change_stock(gen_random_uuid(),gen_random_uuid(),'IN',1,'');
    raise exception 'FAIL: missing product';
  exception when insufficient_privilege then null; end;

  -- Maximum valid balance, replay after an intervening operation and archive.
  receipt := public.change_stock(product.id,shared_id,'ADJUSTMENT',2147483647,'Maximum count test');
  perform set_config('stockmate.stock.shared_id',shared_id::text,true);
  perform public.change_stock(product.id,gen_random_uuid(),'OUT',1,'Intervening movement');
  replay := public.change_stock(product.id,shared_id,'ADJUSTMENT',2147483647,'Maximum count test');
  if replay.id <> receipt.id or (select quantity from public.products where id=product.id) <> 2147483646 then raise exception 'FAIL: replay after intervening operation changed stock'; end if;
  update public.products set is_archived=true where id=product.id;
  replay := public.change_stock(product.id,shared_id,'ADJUSTMENT',2147483647,'Maximum count test');
  if replay.id <> receipt.id then raise exception 'FAIL: completed archived replay lost receipt'; end if;
  begin
    perform public.change_stock(product.id,gen_random_uuid(),'IN',1,'');
    raise exception 'FAIL: new operation on archived product';
  exception when sqlstate 'P1001' then null; end;
end;
$$;

-- Same UUID belongs independently to each user; foreign product access is denied.
select set_config('request.jwt.claim.sub', current_setting('stockmate.stock.b'), true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('stockmate.stock.b'),'role','authenticated')::text,true);
do $$
declare p public.products; r public.stock_movements;
begin
  if exists(select 1 from public.stock_operations) then raise exception 'FAIL: cross-user idempotency read'; end if;
  begin
    perform public.change_stock(current_setting('stockmate.stock.product')::uuid,gen_random_uuid(),'OUT',1,'');
    raise exception 'FAIL: cross-user stock operation';
  exception when insufficient_privilege then null; end;
  p := public.create_product('B stock','B-STOCK',null,'',0);
  r := public.change_stock(p.id,current_setting('stockmate.stock.shared_id')::uuid,'IN',2,'Independent UUID scope');
  if r.quantity_after <> 2 or r.user_id <> auth.uid() then raise exception 'FAIL: per-user UUID scope'; end if;
  begin
    insert into public.stock_operations(user_id,operation_id,product_id,type,requested_quantity,note)
      values(auth.uid(),gen_random_uuid(),p.id,'IN',1,'Unauthorized operation');
    raise exception 'FAIL: direct operation record insert';
  exception when insufficient_privilege then null; end;
  begin
    update public.stock_operations set note='tampered';
    raise exception 'FAIL: operation record update';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.stock_operations;
    raise exception 'FAIL: operation record deletion';
  exception when insufficient_privilege then null; end;
end;
$$;

-- Inject a failure AFTER the quantity update, at movement insertion.
reset role;
create function public.stock_test_reject() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Intentional rollback test' using errcode='23514'; end;
$$;
create trigger stock_test_fail before insert on public.stock_movements for each row execute function public.stock_test_reject();
set local role authenticated;
do $$
declare p public.products; before_row jsonb; before_count bigint; before_ops bigint;
begin
  select * into strict p from public.products where sku='B-STOCK';
  before_row := to_jsonb(p);
  select count(*) into before_count from public.stock_movements;
  select count(*) into before_ops from public.stock_operations;
  begin
    perform public.change_stock(p.id,gen_random_uuid(),'IN',1,'Atomic failure');
    raise exception 'FAIL: expected movement insert failure';
  exception when check_violation then null; end;
  if (select to_jsonb(v) from public.products v where id=p.id) is distinct from before_row
    or (select count(*) from public.stock_movements) <> before_count
    or (select count(*) from public.stock_operations) <> before_ops then raise exception 'FAIL: failure did not roll back quantity/history/operation'; end if;
end;
$$;
-- Also fail the final receipt-link update AFTER the movement was inserted.
reset role;
drop trigger stock_test_fail on public.stock_movements;
create trigger stock_test_operation_fail before update on public.stock_operations
  for each row execute function public.stock_test_reject();
set local role authenticated;
do $$
declare p public.products; before_row jsonb; before_count bigint; before_ops bigint;
begin
  select * into strict p from public.products where sku='B-STOCK';
  before_row := to_jsonb(p);
  select count(*) into before_count from public.stock_movements;
  select count(*) into before_ops from public.stock_operations;
  begin
    perform public.change_stock(p.id,gen_random_uuid(),'IN',1,'Receipt link failure');
    raise exception 'FAIL: expected operation link failure';
  exception when check_violation then null; end;
  if (select to_jsonb(v) from public.products v where id=p.id) is distinct from before_row
    or (select count(*) from public.stock_movements) <> before_count
    or (select count(*) from public.stock_operations) <> before_ops then raise exception 'FAIL: receipt link failure did not roll back all writes'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{}',true);
do $$
begin
  begin
    perform public.change_stock(current_setting('stockmate.stock.product')::uuid,gen_random_uuid(),'IN',1,'');
    raise exception 'FAIL: missing authentication';
  exception when insufficient_privilege then null; end;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform public.change_stock(current_setting('stockmate.stock.product')::uuid,gen_random_uuid(),'IN',1,'');
    raise exception 'FAIL: anonymous function access';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select 'PASS: stock semantics, invalid inputs, ownership, atomic rollback, replay, conflicts and privileges (single session only)' as test_result;
rollback;
