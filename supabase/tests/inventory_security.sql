-- Run after the Stage 3 migration in a DEVELOPMENT Supabase SQL Editor.
-- Uses transaction-local auth claims and fresh fixture users. Always rolls back.
-- Requires a database-owner connection, never a browser key.
begin;

select set_config('stockmate.test.user_a', gen_random_uuid()::text, true);
select set_config('stockmate.test.user_b', gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('stockmate.test.user_a')::uuid, 'stockmate-test-a@example.invalid'),
  (current_setting('stockmate.test.user_b')::uuid, 'stockmate-test-b@example.invalid');

-- Role privilege checks prevent a later broad grant from reopening sensitive writes.
do $$
begin
  if has_table_privilege('authenticated', 'public.products', 'UPDATE')
     or has_table_privilege('authenticated', 'public.products', 'INSERT')
     or has_table_privilege('authenticated', 'public.products', 'DELETE')
     or has_column_privilege('authenticated', 'public.products', 'quantity', 'UPDATE')
     or has_column_privilege('authenticated', 'public.products', 'user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.categories', 'user_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.categories', 'user_id', 'UPDATE')
     or has_table_privilege('authenticated', 'public.stock_movements', 'INSERT')
     or has_table_privilege('authenticated', 'public.stock_movements', 'UPDATE')
     or has_table_privilege('authenticated', 'public.stock_movements', 'DELETE') then
    raise exception 'FAIL: sensitive table/column write privilege exists';
  end if;
  if has_function_privilege('anon', 'public.create_product(text,text,uuid,text,numeric,numeric,numeric,numeric)', 'EXECUTE') then
    raise exception 'FAIL: anonymous callers can execute create_product';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('stockmate.test.user_a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stockmate.test.user_a'), 'role', 'authenticated')::text, true);
insert into public.categories(name) values ('Test Category') returning id;
select set_config('stockmate.test.category_a', (select id::text from public.categories where name = 'Test Category'), true);
select public.create_product('Test Product', 'SKU-001', current_setting('stockmate.test.category_a')::uuid, '', 5, 5, 10, 15);
select set_config('stockmate.test.product_a', (select id::text from public.products where sku = 'SKU-001'), true);

do $$
begin
  if (select count(*) from public.stock_movements where product_id = current_setting('stockmate.test.product_a')::uuid and type = 'IN' and quantity_change = 5 and quantity_after = 5) <> 1 then
    raise exception 'FAIL: initial movement was not created atomically';
  end if;
  if (select user_id from public.products where id = current_setting('stockmate.test.product_a')::uuid) <> auth.uid() then
    raise exception 'FAIL: product owner was not derived from auth.uid()';
  end if;
  begin
    perform public.create_product('Duplicate', ' sku-001 ', null, '', 1);
    raise exception 'FAIL: normalized duplicate SKU accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.categories(name) values (' test category ');
    raise exception 'FAIL: normalized duplicate category accepted';
  exception when unique_violation then null; end;
  begin
    update public.products set quantity = 999 where id = current_setting('stockmate.test.product_a')::uuid;
    raise exception 'FAIL: direct quantity write accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.products set user_id = current_setting('stockmate.test.user_b')::uuid where id = current_setting('stockmate.test.product_a')::uuid;
    raise exception 'FAIL: product ownership write accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.stock_movements(product_id, user_id, type, quantity_change, quantity_after)
    values (current_setting('stockmate.test.product_a')::uuid, auth.uid(), 'IN', 1, 6);
    raise exception 'FAIL: direct movement insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.stock_movements set note = 'Tampered';
    raise exception 'FAIL: movement update accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.stock_movements;
    raise exception 'FAIL: movement deletion accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.products;
    raise exception 'FAIL: product deletion accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.products(user_id, name, sku) values (auth.uid(), 'Bypass', 'BYPASS');
    raise exception 'FAIL: direct product insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.categories(name, user_id) values ('Owner bypass', current_setting('stockmate.test.user_b')::uuid);
    raise exception 'FAIL: category ownership insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.create_product('Fraction', 'FRACTION', null, '', 1.5);
    raise exception 'FAIL: fractional initial quantity accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_product('Negative', 'NEGATIVE', null, '', -1);
    raise exception 'FAIL: negative initial quantity accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_product('Bad Price', 'BAD-PRICE', null, '', 0, 0, -1);
    raise exception 'FAIL: negative price accepted';
  exception when invalid_parameter_value then null; end;
end;
$$;

-- Account B cannot read/update A, and cannot attach A's category.
select set_config('request.jwt.claim.sub', current_setting('stockmate.test.user_b'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stockmate.test.user_b'), 'role', 'authenticated')::text, true);
do $$
begin
  if exists(select 1 from public.products) or exists(select 1 from public.categories) or exists(select 1 from public.stock_movements) then
    raise exception 'FAIL: account B can read account A inventory';
  end if;
  update public.products set name = 'Cross-user edit' where id = current_setting('stockmate.test.product_a')::uuid;
  if found then raise exception 'FAIL: cross-user product update succeeded'; end if;
  update public.categories set name = 'Cross-user rename' where id = current_setting('stockmate.test.category_a')::uuid;
  if found then raise exception 'FAIL: cross-user category update succeeded'; end if;
  begin
    perform public.create_product('Cross category', 'CROSS', current_setting('stockmate.test.category_a')::uuid, '', 1);
    raise exception 'FAIL: RPC accepted another user category';
  exception when foreign_key_violation then null; end;
end;
$$;
-- Same normalized identifiers are allowed for different accounts.
insert into public.categories(name) values ('Test Category');
select public.create_product('B Product', 'SKU-001', null, '', 0);
do $$
begin
  if exists(select 1 from public.stock_movements) then raise exception 'FAIL: zero initial stock generated a movement'; end if;
  begin
    update public.products set category_id = current_setting('stockmate.test.category_a')::uuid;
    raise exception 'FAIL: composite FK accepted another user category';
  exception when foreign_key_violation then null; end;
end;
$$;

-- Archive A and verify history/quantity are preserved.
select set_config('request.jwt.claim.sub', current_setting('stockmate.test.user_a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stockmate.test.user_a'), 'role', 'authenticated')::text, true);
update public.products set is_archived = true where id = current_setting('stockmate.test.product_a')::uuid;
do $$
begin
  if (select quantity from public.products where id = current_setting('stockmate.test.product_a')::uuid and is_archived) <> 5
     or (select count(*) from public.stock_movements) <> 1 then
    raise exception 'FAIL: archiving lost quantity or history';
  end if;
  begin
    perform public.create_product('Archived duplicate', 'sku-001');
    raise exception 'FAIL: archived SKU can be reused';
  exception when unique_violation then null; end;
end;
$$;

-- Force the SECOND write to fail: the product insert must roll back too.
reset role;
create function public.stockmate_test_reject_movement() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Intentional movement failure' using errcode = '23514'; end;
$$;
create trigger stockmate_test_movement_failure before insert on public.stock_movements
for each row execute function public.stockmate_test_reject_movement();
set local role authenticated;
do $$
begin
  begin
    perform public.create_product('Atomic rollback', 'ATOMIC-FAIL', null, '', 7);
    raise exception 'FAIL: expected movement failure';
  exception when check_violation then null; end;
  if exists(select 1 from public.products where sku = 'ATOMIC-FAIL') then
    raise exception 'FAIL: product survived a failed initial movement';
  end if;
end;
$$;

-- No-session and anonymous calls must fail.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform public.create_product('Unauthenticated', 'NO-SESSION');
    raise exception 'FAIL: RPC accepted missing auth.uid()';
  exception when insufficient_privilege then null; end;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform public.create_product('Anonymous', 'ANON');
    raise exception 'FAIL: anonymous RPC execution succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.products;
    raise exception 'FAIL: anonymous product read succeeded';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
-- Account deletion may remove its own inventory; ordinary clients cannot do this.
delete from auth.users where id = current_setting('stockmate.test.user_a')::uuid;
do $$
begin
  if exists(select 1 from public.products where user_id = current_setting('stockmate.test.user_a')::uuid)
     or exists(select 1 from public.categories where user_id = current_setting('stockmate.test.user_a')::uuid)
     or exists(select 1 from public.stock_movements where user_id = current_setting('stockmate.test.user_a')::uuid) then
    raise exception 'FAIL: auth user deletion did not cascade its own inventory';
  end if;
end;
$$;
select 'PASS: inventory ownership, RLS, grants, uniqueness, archival, and atomicity assertions' as test_result;
rollback;
