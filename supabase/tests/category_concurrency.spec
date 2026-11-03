# PostgreSQL isolationtester specification. PREPARED ONLY, NOT EXECUTED.
# Use only a dedicated disposable LOCAL database with all migrations applied.
# Never point this file at a remote project or existing user inventory.
# Each permutation uses independent real database connections and fresh fixtures.
setup
{
  INSERT INTO auth.users(id) VALUES ('cccccccc-0000-4000-8000-000000000073');
  INSERT INTO public.categories(id,user_id,name) VALUES
    ('11111111-0000-4000-8000-000000000073','cccccccc-0000-4000-8000-000000000073','Concurrency source'),
    ('22222222-0000-4000-8000-000000000073','cccccccc-0000-4000-8000-000000000073','Concurrency destination');
  SELECT set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000073',false);
  SET ROLE authenticated;
  SELECT public.create_product('Kept active','CAT-CONCURRENT-A','11111111-0000-4000-8000-000000000073','',4);
  SELECT public.create_product('Kept archived','CAT-CONCURRENT-B','11111111-0000-4000-8000-000000000073','',4);
  SELECT public.create_product('Reassign target','CAT-CONCURRENT-C',null,'',4);
  UPDATE public.products SET is_archived=true WHERE sku='CAT-CONCURRENT-B';
  SELECT public.change_stock((SELECT id FROM public.products WHERE sku='CAT-CONCURRENT-A'),
    'dddddddd-0000-4000-8000-000000000073','IN',1,'Fixture receipt');
  RESET ROLE;
}
teardown
{
  DELETE FROM auth.users WHERE id='cccccccc-0000-4000-8000-000000000073';
}
session "deleter"
setup
{
  SET ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000073',false);
}
step "d_begin" { BEGIN; }
step "d_delete" { SELECT * FROM public.delete_category('11111111-0000-4000-8000-000000000073','move','22222222-0000-4000-8000-000000000073'); }
step "d_race"
{
  DO $$ BEGIN
    PERFORM public.delete_category('11111111-0000-4000-8000-000000000073','move','22222222-0000-4000-8000-000000000073');
  EXCEPTION WHEN insufficient_privilege THEN
    IF (SELECT count(*) FROM public.categories) <> 1 THEN RAISE; END IF;
  END $$;
}
step "d_commit" { COMMIT; }
step "verify_overlap"
{
  DO $$ BEGIN
    IF (SELECT count(*) FROM public.categories) <> 1 OR (SELECT count(*) FROM public.products) <> 3 THEN
      RAISE EXCEPTION 'Competing deletions must leave one category and every product'; END IF;
    IF EXISTS(SELECT 1 FROM public.products p LEFT JOIN public.categories c ON (c.id,c.user_id)=(p.category_id,p.user_id)
      WHERE p.sku IN ('CAT-CONCURRENT-A','CAT-CONCURRENT-B') AND c.id IS NULL) THEN
      RAISE EXCEPTION 'Competing deletion lost a product category'; END IF;
    IF (SELECT quantity FROM public.products WHERE sku='CAT-CONCURRENT-A') <> 5
      OR (SELECT quantity FROM public.products WHERE sku='CAT-CONCURRENT-B') <> 4
      OR (SELECT quantity FROM public.products WHERE sku='CAT-CONCURRENT-C') <> 4
      OR (SELECT count(*) FROM public.stock_movements) <> 4
      OR (SELECT count(*) FROM public.stock_operations) <> 1 THEN RAISE EXCEPTION 'Stock/history/operation data changed'; END IF;
  END $$;
}
step "verify"
{
  DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM public.categories WHERE id='11111111-0000-4000-8000-000000000073') THEN
      RAISE EXCEPTION 'Source was not deleted'; END IF;
    IF (SELECT count(*) FROM public.products WHERE sku IN ('CAT-CONCURRENT-A','CAT-CONCURRENT-B','CAT-CONCURRENT-C')) <> 3 THEN
      RAISE EXCEPTION 'Products were lost'; END IF;
    IF EXISTS(SELECT 1 FROM public.products p LEFT JOIN public.categories c ON (c.id,c.user_id)=(p.category_id,p.user_id)
      WHERE p.category_id IS NOT NULL AND c.id IS NULL) THEN RAISE EXCEPTION 'Dangling category'; END IF;
    IF EXISTS(SELECT 1 FROM public.products WHERE sku IN ('CAT-CONCURRENT-A','CAT-CONCURRENT-B')
      AND category_id IS DISTINCT FROM '22222222-0000-4000-8000-000000000073'::uuid) THEN RAISE EXCEPTION 'Existing product not moved'; END IF;
    IF EXISTS(SELECT 1 FROM public.products WHERE sku='CAT-CONCURRENT-NEW'
      AND category_id IS DISTINCT FROM '22222222-0000-4000-8000-000000000073'::uuid) THEN RAISE EXCEPTION 'Committed concurrent creation not moved'; END IF;
    IF (SELECT quantity FROM public.products WHERE sku='CAT-CONCURRENT-A') <> 5
      OR (SELECT quantity FROM public.products WHERE sku='CAT-CONCURRENT-B') <> 4
      OR (SELECT quantity FROM public.products WHERE sku='CAT-CONCURRENT-C') <> 4 THEN RAISE EXCEPTION 'Quantity changed'; END IF;
    IF NOT (SELECT is_archived FROM public.products WHERE sku='CAT-CONCURRENT-B') THEN RAISE EXCEPTION 'Archive flag changed'; END IF;
    IF (SELECT count(*) FROM public.stock_movements m JOIN public.products p ON p.id=m.product_id
      WHERE p.sku IN ('CAT-CONCURRENT-A','CAT-CONCURRENT-B','CAT-CONCURRENT-C')) <> 4 THEN RAISE EXCEPTION 'History changed'; END IF;
    IF (SELECT count(*) FROM public.stock_operations WHERE operation_id='dddddddd-0000-4000-8000-000000000073') <> 1 THEN
      RAISE EXCEPTION 'Operation record changed'; END IF;
  END $$;
}
session "writer"
setup
{
  SET ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub','cccccccc-0000-4000-8000-000000000073',false);
}
step "w_begin" { BEGIN; }
step "w_reverse"
{
  DO $$ BEGIN
    PERFORM public.delete_category('22222222-0000-4000-8000-000000000073','move','11111111-0000-4000-8000-000000000073');
  EXCEPTION WHEN insufficient_privilege THEN
    IF (SELECT count(*) FROM public.categories) <> 1 THEN RAISE; END IF;
  END $$;
}
step "w_insert"
{
  DO $$ BEGIN
    PERFORM public.create_product('Concurrent new product','CAT-CONCURRENT-NEW','11111111-0000-4000-8000-000000000073','',2);
  EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN
    IF EXISTS(SELECT 1 FROM public.categories WHERE id='11111111-0000-4000-8000-000000000073') THEN RAISE; END IF;
  END $$;
}
step "w_assign"
{
  DO $$ BEGIN
    UPDATE public.products SET category_id='11111111-0000-4000-8000-000000000073' WHERE sku='CAT-CONCURRENT-C';
  EXCEPTION WHEN foreign_key_violation THEN
    IF EXISTS(SELECT 1 FROM public.categories WHERE id='11111111-0000-4000-8000-000000000073') THEN RAISE; END IF;
  END $$;
}
step "w_move_out" { UPDATE public.products SET category_id='22222222-0000-4000-8000-000000000073' WHERE sku='CAT-CONCURRENT-A'; }
step "w_commit" { COMMIT; }

permutation "d_begin" "d_delete" "w_begin" "w_insert" "d_commit" "w_commit" "verify"
permutation "w_begin" "w_insert" "d_begin" "d_delete" "w_commit" "d_commit" "verify"
permutation "d_begin" "d_delete" "w_begin" "w_assign" "d_commit" "w_commit" "verify"
permutation "w_begin" "w_assign" "d_begin" "d_delete" "w_commit" "d_commit" "verify"
permutation "d_begin" "d_delete" "w_begin" "w_move_out" "d_commit" "w_commit" "verify"
permutation "w_begin" "w_move_out" "d_begin" "d_delete" "w_commit" "d_commit" "verify"

permutation "d_begin" "d_race" "w_begin" "w_reverse" "d_commit" "w_commit" "verify_overlap"
permutation "w_begin" "w_reverse" "d_begin" "d_race" "w_commit" "d_commit" "verify_overlap"
