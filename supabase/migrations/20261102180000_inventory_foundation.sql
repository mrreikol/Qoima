-- StockMate Stage 3. Apply once as the database owner (for example, SQL Editor).
-- No remote database is modified by creating this file.
begin;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name, E' \t\n\r')) between 1 and 100),
  normalized_name text generated always as (lower(btrim(name, E' \t\n\r'))) stored,
  created_at timestamptz not null default now(),
  constraint categories_user_name_key unique (user_id, normalized_name),
  constraint categories_id_user_key unique (id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  name text not null check (length(btrim(name, E' \t\n\r')) between 1 and 150),
  sku text not null check (length(btrim(sku, E' \t\n\r')) between 1 and 64),
  normalized_sku text generated always as (lower(btrim(sku, E' \t\n\r'))) stored,
  description text not null default '' check (length(description) <= 2000),
  quantity integer not null default 0 check (quantity >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0 and cost_price <> 'NaN'::numeric),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0 and selling_price <> 'NaN'::numeric),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_user_sku_key unique (user_id, normalized_sku),
  constraint products_id_user_key unique (id, user_id),
  constraint products_category_owner_fkey foreign key (category_id, user_id)
    references public.categories(id, user_id) on delete no action
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('IN', 'OUT', 'ADJUSTMENT')),
  quantity_change integer not null check (quantity_change <> 0),
  quantity_after integer not null check (quantity_after >= 0),
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  constraint stock_movements_product_owner_fkey foreign key (product_id, user_id)
    references public.products(id, user_id) on delete cascade,
  constraint stock_movements_direction_check check (
    (type = 'IN' and quantity_change > 0) or
    (type = 'OUT' and quantity_change < 0) or type = 'ADJUSTMENT'
  )
);
create index products_user_category_idx on public.products(user_id, category_id);
create index products_user_archive_idx on public.products(user_id, is_archived);
create index stock_movements_user_created_idx on public.stock_movements(user_id, created_at desc);
create index stock_movements_product_idx on public.stock_movements(product_id, user_id);

create function public.set_product_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.set_product_updated_at() from public, anon, authenticated;
create trigger products_updated_at before update on public.products
for each row execute function public.set_product_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

create policy categories_select_own on public.categories for select to authenticated
  using (user_id = (select auth.uid()));
create policy categories_insert_own on public.categories for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy categories_update_own on public.categories for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy products_select_own on public.products for select to authenticated
  using (user_id = (select auth.uid()));
create policy products_insert_own on public.products for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy products_update_own on public.products for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy movements_select_own on public.stock_movements for select to authenticated
  using (user_id = (select auth.uid()));

-- Revoke inherited default table grants BEFORE adding narrowly scoped grants.
-- RLS alone does not restrict which columns an owner can update.
revoke all on table public.categories, public.products, public.stock_movements from public, anon, authenticated;
grant select on table public.categories, public.products, public.stock_movements to authenticated;
grant insert (name), update (name) on public.categories to authenticated;
grant update (category_id, name, sku, description, min_stock, cost_price, selling_price, is_archived)
  on public.products to authenticated;
-- No direct product INSERT/DELETE, quantity/ownership UPDATE, or movement writes.

create function public.create_product(
  p_name text,
  p_sku text,
  p_category_id uuid default null,
  p_description text default '',
  p_initial_quantity numeric default 0,
  p_min_stock numeric default 0,
  p_cost_price numeric default 0,
  p_selling_price numeric default 0
) returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  created_product public.products;
begin
  if owner_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name, E' \t\n\r')) not between 1 and 150
    or p_sku is null or length(btrim(p_sku, E' \t\n\r')) not between 1 and 64 then
    raise exception 'A product name and SKU are required.' using errcode = '22023';
  end if;
  if p_initial_quantity is null or p_min_stock is null
    or p_initial_quantity < 0 or p_min_stock < 0
    or p_initial_quantity > 2147483647 or p_min_stock > 2147483647
    or p_initial_quantity <> trunc(p_initial_quantity) or p_min_stock <> trunc(p_min_stock)
    or p_initial_quantity = 'NaN'::numeric or p_min_stock = 'NaN'::numeric then
    raise exception 'Stock quantities must be nonnegative integers.' using errcode = '22023';
  end if;
  if p_cost_price is null or p_selling_price is null
    or p_cost_price < 0 or p_selling_price < 0
    or p_cost_price > 9999999999.99 or p_selling_price > 9999999999.99
    or p_cost_price = 'NaN'::numeric or p_selling_price = 'NaN'::numeric then
    raise exception 'Prices must be nonnegative finite amounts.' using errcode = '22023';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and user_id = owner_id
  ) then
    raise exception 'Category is unavailable for this account.' using errcode = '23503';
  end if;
  insert into public.products (user_id, category_id, name, sku, description, quantity, min_stock, cost_price, selling_price)
  values (owner_id, p_category_id, btrim(p_name, E' \t\n\r'), btrim(p_sku, E' \t\n\r'),
    coalesce(p_description, ''), p_initial_quantity::integer, p_min_stock::integer, p_cost_price, p_selling_price)
  returning * into created_product;
  if created_product.quantity > 0 then
    insert into public.stock_movements (product_id, user_id, type, quantity_change, quantity_after, note)
    values (created_product.id, owner_id, 'IN', created_product.quantity, created_product.quantity, 'Initial stock');
  end if;
  return created_product;
end;
$$;
revoke all on function public.create_product(text, text, uuid, text, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.create_product(text, text, uuid, text, numeric, numeric, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
commit;
