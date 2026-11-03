-- Stage 4. Apply AFTER 20261102180000_inventory_foundation.sql.
-- File creation does not apply this migration to the remote project.
begin;

create table public.stock_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  product_id uuid not null,
  type text not null check (type in ('IN', 'OUT', 'ADJUSTMENT')),
  requested_quantity integer not null check (requested_quantity >= 0),
  note text not null check (length(note) <= 2000),
  movement_id uuid unique references public.stock_movements(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  constraint stock_operations_product_owner_fkey foreign key (product_id, user_id)
    references public.products(id, user_id) on delete cascade
);
create index stock_operations_product_idx on public.stock_operations(product_id, user_id);
alter table public.stock_operations enable row level security;
create policy stock_operations_select_own on public.stock_operations
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.stock_operations from public, anon, authenticated;
grant select on table public.stock_operations to authenticated;
-- No client INSERT/UPDATE/DELETE/TRUNCATE grants, including ownership fields.

create function public.change_stock(
  p_product_id uuid,
  p_operation_id uuid,
  p_type text,
  p_quantity numeric,
  p_note text default ''
) returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  locked_product public.products;
  operation public.stock_operations;
  movement public.stock_movements;
  next_quantity bigint;
  delta integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_product_id is null or p_operation_id is null then
    raise exception 'Product and operation UUIDs are required.' using errcode = '22023';
  end if;
  if p_type is null or p_type not in ('IN', 'OUT', 'ADJUSTMENT') then
    raise exception 'Stock operation type must be IN, OUT, or ADJUSTMENT.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 2147483647
     or p_quantity <> pg_catalog.trunc(p_quantity) or p_quantity = 'NaN'::numeric
     or (p_type in ('IN', 'OUT') and p_quantity = 0) then
    raise exception 'Enter a valid whole quantity within the integer range.' using errcode = '22023';
  end if;
  if p_note is null or pg_catalog.length(p_note) > 2000 then
    raise exception 'Note must be text with at most 2000 characters.' using errcode = '22023';
  end if;
  if p_type = 'ADJUSTMENT' and (
    pg_catalog.length(pg_catalog.regexp_replace(p_note, '[[:space:]]', '', 'g')) < 3
    or p_note !~ '[[:alnum:]]'
  ) then
    raise exception 'Explain the adjustment with at least 3 non-whitespace characters and a letter or number.' using errcode = '22023';
  end if;

  -- Lock BEFORE reading quantity or creating a foreign-key-linked operation row.
  -- This also avoids FK KEY SHARE -> FOR UPDATE upgrade deadlocks on one product.
  select p.* into locked_product from public.products p
    where p.id = p_product_id and p.user_id = actor_id for update;
  if not found then
    raise exception 'Product is unavailable for this account.' using errcode = '42501';
  end if;

  select o.* into operation from public.stock_operations o
    where o.user_id = actor_id and o.operation_id = p_operation_id;
  if not found then
    if locked_product.is_archived then
      raise exception 'Archived products cannot receive new stock operations.' using errcode = 'P1001';
    end if;
    -- The unique key also serializes UUID reuse across DIFFERENT products.
    insert into public.stock_operations(user_id, operation_id, product_id, type, requested_quantity, note)
    values(actor_id, p_operation_id, p_product_id, p_type, p_quantity::integer, p_note)
    on conflict (user_id, operation_id) do nothing;
    select o.* into strict operation from public.stock_operations o
      where o.user_id = actor_id and o.operation_id = p_operation_id;
  end if;
  if operation.product_id <> p_product_id or operation.type <> p_type
     or operation.requested_quantity <> p_quantity or operation.note <> p_note then
    raise exception 'Operation UUID was already used with different inputs.' using errcode = 'P1004';
  end if;
  if operation.movement_id is not null then
    -- A completed replay returns its original immutable receipt, even after archival.
    -- It does not update the product and does not create another movement.
    select m.* into strict movement from public.stock_movements m
      where m.id = operation.movement_id and m.user_id = actor_id;
    return movement;
  end if;
  if locked_product.is_archived then
    raise exception 'Archived products cannot receive new stock operations.' using errcode = 'P1001';
  end if;

  if p_type = 'IN' then
    next_quantity := locked_product.quantity::bigint + p_quantity::bigint;
  elsif p_type = 'OUT' then
    next_quantity := locked_product.quantity::bigint - p_quantity::bigint;
    if next_quantity < 0 then
      raise exception 'Insufficient stock for this operation.' using errcode = 'P1002';
    end if;
  else
    next_quantity := p_quantity::bigint;
    if next_quantity = locked_product.quantity then
      raise exception 'Actual quantity matches the current stock. No adjustment is needed.' using errcode = 'P1003';
    end if;
  end if;
  if next_quantity > 2147483647 then
    raise exception 'Resulting stock exceeds the integer limit.' using errcode = '22003';
  end if;
  delta := (next_quantity - locked_product.quantity)::integer;
  update public.products set quantity = next_quantity::integer
    where id = p_product_id and user_id = actor_id;
  insert into public.stock_movements(product_id, user_id, type, quantity_change, quantity_after, note)
    values(p_product_id, actor_id, p_type, delta, next_quantity::integer, p_note)
    returning * into movement;
  update public.stock_operations set movement_id = movement.id
    where user_id = actor_id and operation_id = p_operation_id;
  return movement;
end;
$$;
revoke all on function public.change_stock(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.change_stock(uuid, uuid, text, numeric, text) to authenticated;
-- Existing product quantity/ownership and movement write grants remain unchanged.
notify pgrst, 'reload schema';
commit;
