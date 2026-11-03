-- Local/transactional authorization regression tests. NOT an HTTP/Auth test.
-- Do not run remotely during the authorization-review task.
begin;
select set_config('stockmate.verify.a', gen_random_uuid()::text, true);
select set_config('stockmate.verify.b', gen_random_uuid()::text, true);
insert into auth.users(id, email) values
  (current_setting('stockmate.verify.a')::uuid, 'authorization-a@example.invalid'),
  (current_setting('stockmate.verify.b')::uuid, 'authorization-b@example.invalid');

-- Every request under test uses the ordinary authenticated role, never the owner.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('stockmate.verify.a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stockmate.verify.a'), 'role', 'authenticated')::text, true);
insert into public.categories(name) values ('Authorization fixture A');
select set_config('stockmate.verify.category_a', (select id::text from public.categories where name = 'Authorization fixture A'), true);
select public.create_product('Authorization A', 'AUTHZ-A', current_setting('stockmate.verify.category_a')::uuid, '', 5, 2, 10, 15);
select set_config('stockmate.verify.product_a', (select id::text from public.products where sku = 'AUTHZ-A'), true);
select set_config('stockmate.verify.movement_a', (select id::text from public.stock_movements where product_id = current_setting('stockmate.verify.product_a')::uuid), true);
select set_config('stockmate.verify.snapshot_a', (select row_to_json(p)::text from public.products p where id = current_setting('stockmate.verify.product_a')::uuid), true);

select set_config('request.jwt.claim.sub', current_setting('stockmate.verify.b'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('stockmate.verify.b'), 'role', 'authenticated')::text, true);
insert into public.categories(name) values ('Authorization fixture B');
select set_config('stockmate.verify.category_b', (select id::text from public.categories where name = 'Authorization fixture B'), true);
select public.create_product('Authorization B', 'AUTHZ-B', current_setting('stockmate.verify.category_b')::uuid, '', 7, 3, 20, 25);
select set_config('stockmate.verify.product_b', (select id::text from public.products where sku = 'AUTHZ-B'), true);
select set_config('stockmate.verify.movement_b', (select id::text from public.stock_movements where product_id = current_setting('stockmate.verify.product_b')::uuid), true);

do $$
declare
  account text;
  other text;
  target_id uuid;
  category_id uuid;
  movement_id uuid;
  before_product jsonb;
  before_category jsonb;
  before_movements jsonb;
  after_product jsonb;
  affected bigint;
begin
  foreach account in array array['a', 'b'] loop
    other := case when account = 'a' then 'b' else 'a' end;
    perform set_config('request.jwt.claim.sub', current_setting('stockmate.verify.' || account), true);
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('stockmate.verify.' || account), 'role', 'authenticated')::text, true);
    if current_user <> 'authenticated' or auth.uid() <> current_setting('stockmate.verify.' || account)::uuid then
      raise exception 'FAIL: incorrect ordinary authenticated test context';
    end if;
    target_id := current_setting('stockmate.verify.product_' || account)::uuid;
    category_id := current_setting('stockmate.verify.category_' || account)::uuid;
    movement_id := current_setting('stockmate.verify.movement_' || account)::uuid;

    -- Read restrictions include exact known UUIDs and owner-filtered listings.
    if exists(select 1 from public.products where id = current_setting('stockmate.verify.product_' || other)::uuid)
      or exists(select 1 from public.categories where id = current_setting('stockmate.verify.category_' || other)::uuid)
      or exists(select 1 from public.stock_movements where id = current_setting('stockmate.verify.movement_' || other)::uuid)
      or exists(select 1 from public.products where user_id = current_setting('stockmate.verify.' || other)::uuid)
      or exists(select 1 from public.categories where user_id = current_setting('stockmate.verify.' || other)::uuid)
      or exists(select 1 from public.stock_movements where user_id = current_setting('stockmate.verify.' || other)::uuid) then
      raise exception 'FAIL: % can read another account by ID or list', account;
    end if;

    -- Explicitly assert zero affected rows. An error-free request is not success.
    update public.products set name = 'Unauthorized edit' where id = current_setting('stockmate.verify.product_' || other)::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'FAIL: cross-account metadata update affected a row'; end if;
    update public.products set is_archived = true where id = current_setting('stockmate.verify.product_' || other)::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'FAIL: cross-account archive affected a row'; end if;
    update public.categories set name = 'Unauthorized category rename' where id = current_setting('stockmate.verify.category_' || other)::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'FAIL: cross-account category rename affected a row'; end if;

    select to_jsonb(p) into strict before_product from public.products p where id = target_id;
    select to_jsonb(c) into strict before_category from public.categories c where id = category_id;
    select jsonb_agg(to_jsonb(m) order by id) into before_movements from public.stock_movements m where product_id = target_id;
    if jsonb_array_length(before_movements) <> 1 then raise exception 'FAIL: own initial movement missing'; end if;
    if (before_product->>'user_id')::uuid <> auth.uid()
      or (before_product->>'category_id')::uuid <> category_id
      or (before_product->>'quantity')::integer <> (case when account = 'a' then 5 else 7 end)
      or before_movements->0->>'type' <> 'IN'
      or (before_movements->0->>'quantity_change')::integer <> (before_product->>'quantity')::integer
      or (before_movements->0->>'quantity_after')::integer <> (before_product->>'quantity')::integer then
      raise exception 'FAIL: own product/initial movement values are incorrect';
    end if;

    begin
      perform public.create_product('Cross category', 'AUTHZ-CROSS-' || account, current_setting('stockmate.verify.category_' || other)::uuid, '', 1);
      raise exception 'FAIL: RPC accepted another account category';
    exception when foreign_key_violation then null; end;
    if exists(select 1 from public.products where sku = 'AUTHZ-CROSS-' || account) then
      raise exception 'FAIL: rejected RPC left a product';
    end if;
    begin
      update public.products set category_id = current_setting('stockmate.verify.category_' || other)::uuid where id = target_id;
      raise exception 'FAIL: metadata update accepted another account category';
    exception when foreign_key_violation then null; end;

    begin
      update public.products set quantity = quantity + 1 where id = target_id;
      raise exception 'FAIL: direct quantity update allowed';
    exception when insufficient_privilege then null; end;
    begin
      update public.products set user_id = current_setting('stockmate.verify.' || other)::uuid where id = target_id;
      raise exception 'FAIL: product ownership update allowed';
    exception when insufficient_privilege then null; end;
    begin
      update public.categories set user_id = current_setting('stockmate.verify.' || other)::uuid where id = category_id;
      raise exception 'FAIL: category ownership update allowed';
    exception when insufficient_privilege then null; end;
    begin
      insert into public.stock_movements(product_id, user_id, type, quantity_change, quantity_after, note)
      values(target_id, auth.uid(), 'IN', 1, 99, 'Unauthorized fixture movement');
      raise exception 'FAIL: direct movement insert allowed';
    exception when insufficient_privilege then null; end;
    begin
      update public.stock_movements set note = 'Unauthorized movement edit' where id = movement_id;
      raise exception 'FAIL: direct movement update allowed';
    exception when insufficient_privilege then null; end;
    begin
      delete from public.stock_movements where id = movement_id;
      raise exception 'FAIL: direct movement delete allowed';
    exception when insufficient_privilege then null; end;

    -- Read back as the owner and compare complete rows, including timestamps.
    select to_jsonb(p) into strict after_product from public.products p where id = target_id;
    if after_product is distinct from before_product then raise exception 'FAIL: denied writes changed own product'; end if;
    if (select to_jsonb(c) from public.categories c where id = category_id) is distinct from before_category then raise exception 'FAIL: denied writes changed category'; end if;
    if (select jsonb_agg(to_jsonb(m) order by id) from public.stock_movements m where product_id = target_id) is distinct from before_movements then
      raise exception 'FAIL: denied writes changed movement history';
    end if;

    -- Positive controls: own allowed changes must actually affect and persist rows.
    update public.categories set name = 'Allowed rename ' || account where id = category_id;
    get diagnostics affected = row_count;
    if affected <> 1 or not exists(select 1 from public.categories where id = category_id and name = 'Allowed rename ' || account) then
      raise exception 'FAIL: own category rename failed';
    end if;
    update public.products set name = 'Allowed edit ' || account, description = 'Allowed metadata', min_stock = 4, cost_price = 12.50, selling_price = 19.50 where id = target_id;
    get diagnostics affected = row_count;
    if affected <> 1 or not exists(select 1 from public.products where id = target_id and name = 'Allowed edit ' || account and description = 'Allowed metadata' and min_stock = 4 and cost_price = 12.50 and selling_price = 19.50 and quantity = (before_product->>'quantity')::integer and user_id = auth.uid()) then
      raise exception 'FAIL: own metadata edit failed or changed protected fields';
    end if;
    if (select jsonb_agg(to_jsonb(m) order by id) from public.stock_movements m where product_id = target_id) is distinct from before_movements then
      raise exception 'FAIL: metadata edit changed stock movements';
    end if;
    perform set_config('stockmate.verify.final_' || account, (select to_jsonb(p)::text from public.products p where id = target_id), true);
  end loop;

  -- B's edit/archive attempts against A happened after A's positive controls.
  perform set_config('request.jwt.claim.sub', current_setting('stockmate.verify.a'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('stockmate.verify.a'), 'role', 'authenticated')::text, true);
  select to_jsonb(p) into strict after_product from public.products p where id = current_setting('stockmate.verify.product_a')::uuid;
  if after_product is distinct from current_setting('stockmate.verify.final_a')::jsonb or (after_product->>'is_archived')::boolean then
    raise exception 'FAIL: A owner read-back detected a change after B attempted edit/archive';
  end if;
end;
$$;
reset role;
select 'PASS: two-user known-ID isolation, unchanged owner rows, category ownership, restricted writes, and own-data positive controls' as test_result;
rollback;
