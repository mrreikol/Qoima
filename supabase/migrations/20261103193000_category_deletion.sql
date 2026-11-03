-- Apply after the foundation/stock migrations. Does not apply remote changes.
begin;

-- Keep deletion behind the RPC, including projects with permissive defaults.
revoke delete, truncate on public.categories from public, anon, authenticated;

create function public.delete_category(
  p_category_id uuid,
  p_action text,
  p_destination_category_id uuid default null
) returns table (deleted_category_id uuid, affected_products bigint)
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  moved_count bigint := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_category_id is null or p_action is null
     or p_action not in ('empty', 'uncategorized', 'move') then
    raise exception 'Choose what happens to the products.' using errcode = '22023';
  end if;
  if (p_action = 'move' and (p_destination_category_id is null or p_destination_category_id = p_category_id))
     or (p_action <> 'move' and p_destination_category_id is not null) then
    raise exception 'Choose a different destination category.' using errcode = '22023';
  end if;

  -- UUID order serializes overlapping deletes. FOR UPDATE also conflicts with
  -- the composite FK's KEY SHARE locks taken by inserts/category assignments.
  -- A writer that committed first is included by the subsequent fresh statements;
  -- a later assignment to the deleted source fails its FK instead of dangling.
  perform c.id from public.categories c
    where c.user_id = actor_id
      and (c.id = p_category_id or c.id = p_destination_category_id)
    order by c.id for update;
  if not exists (select 1 from public.categories c where c.id = p_category_id and c.user_id = actor_id) then
    raise exception 'Category is unavailable for this account.' using errcode = '42501';
  end if;
  if p_action = 'move' and not exists (
    select 1 from public.categories c where c.id = p_destination_category_id and c.user_id = actor_id
  ) then
    raise exception 'Destination category is unavailable for this account.' using errcode = '42501';
  end if;

  -- Stable row order for bulk work. Concurrent metadata reassignments can still
  -- produce a PostgreSQL deadlock/serialization abort; never catch and partially
  -- commit it. The client refreshes and requires a new confirmation in that case.
  perform p.id from public.products p
    where p.user_id = actor_id and p.category_id = p_category_id
    order by p.id for update;
  if p_action = 'empty' and exists (
    select 1 from public.products p where p.user_id = actor_id and p.category_id = p_category_id
  ) then
    raise exception 'This category now contains products. Refresh and choose what happens to them.' using errcode = '22023';
  end if;

  if p_action <> 'empty' then
    update public.products p
      set category_id = case when p_action = 'move' then p_destination_category_id else null end
      where p.user_id = actor_id and p.category_id = p_category_id;
    get diagnostics moved_count = row_count;
  end if;
  delete from public.categories c where c.id = p_category_id and c.user_id = actor_id;
  return query select p_category_id, moved_count;
end;
$$;

revoke all on function public.delete_category(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.delete_category(uuid, text, uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
