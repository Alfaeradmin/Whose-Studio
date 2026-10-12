-- WHOSE STUDIO ONLY (Supabase project fjauxxunyxxboduyxjyr).
-- Owner approved Kiot branches 1263919 LVS + 1280205 NVT as operational
-- stores. Kiot 1280006 THE BOX ICON is EXCLUDED from Whose operations.
-- Atomic, fail-closed and retry-safe. No ownership/stock/order/employee mutations.
DO $whose_activate_verified_stores$
DECLARE
  v_inventory_before bigint;
  v_products_before bigint;
  v_requests_before bigint;
  v_inserts integer;
BEGIN
  -- The three real-source records were fetched from KiotViet and recorded
  -- 2026-10-12; exact matching prevents wrong project or fake branches.
  IF (SELECT count(*) FROM public.whose_kiot_branch_directory) <> 3
     OR (SELECT count(*) FROM public.whose_kiot_branch_directory s
         WHERE (s.kiot_branch_id=1263919 AND s.name='WHOSE STUDIO LVS')
            OR (s.kiot_branch_id=1280205 AND s.name='WHOSE STUDIO NVT')
            OR (s.kiot_branch_id=1280006 AND s.name='THE BOX ICON')) <> 3
  THEN
     RAISE EXCEPTION 'Expected Whose KiotViet branch source snapshot not found; no changes made';
  END IF;

  -- The old retired admin must be absent and the successor must be the
  -- only verified, active Whose global administrator.
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE lower(email)='alfaeradmin@gmail.com'
  ) OR (SELECT count(*) FROM public.whose_staff_profiles WHERE is_active AND is_global_admin) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM auth.users u
       JOIN public.whose_staff_profiles p ON p.user_id=u.id
       JOIN whose_private.initial_admin_onboarding i ON i.activated_user_id=u.id
       WHERE lower(u.email)='nguyenducnguyen743@gmail.com'
         AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
         AND p.is_active AND p.is_global_admin
         AND i.state='activated'
     )
  THEN RAISE EXCEPTION 'Whose successor admin authorization not ready'; END IF;

  -- Fail closed if another operator created a different operational branch,
  -- or if either existing store mapping is different/inactive.
  IF EXISTS (
      SELECT 1 FROM public.whose_branches b
      WHERE b.kiot_branch_id IS NULL
         OR b.kiot_branch_id NOT IN (1263919,1280205)
         OR b.kind IS DISTINCT FROM 'store'
         OR b.is_active IS DISTINCT FROM true
         OR NOT EXISTS (
           SELECT 1 FROM public.whose_kiot_branch_directory s
           WHERE s.kiot_branch_id=b.kiot_branch_id
             AND s.name=b.name
             AND s.code IS NOT DISTINCT FROM b.code
         )
  ) THEN
    RAISE EXCEPTION 'Unexpected existing operational branch; inspect before applying';
  END IF;

  v_inventory_before := (SELECT count(*) FROM public.whose_inventory_snapshots);
  v_products_before := (SELECT count(*) FROM public.whose_products);
  v_requests_before := (SELECT count(*) FROM public.whose_requests);

  INSERT INTO public.whose_branches (kiot_branch_id,code,name,kind,is_active)
  SELECT s.kiot_branch_id,s.code,s.name,'store',true
  FROM public.whose_kiot_branch_directory s
  WHERE s.kiot_branch_id IN (1263919,1280205)
  ON CONFLICT (kiot_branch_id) DO NOTHING;
  GET DIAGNOSTICS v_inserts = ROW_COUNT;

  IF (SELECT count(*) FROM public.whose_branches) <> 2
     OR (SELECT count(*) FROM public.whose_branches b
         WHERE b.kind='store' AND b.is_active
           AND b.kiot_branch_id IN (1263919,1280205)
           AND EXISTS (
             SELECT 1 FROM public.whose_kiot_branch_directory s
             WHERE s.kiot_branch_id=b.kiot_branch_id
               AND s.name=b.name
               AND s.code IS NOT DISTINCT FROM b.code
           )) <> 2
     OR EXISTS (SELECT 1 FROM public.whose_branches WHERE kiot_branch_id=1280006)
  THEN
    RAISE EXCEPTION 'Whose branch mapping postcondition failed';
  END IF;

  IF (SELECT count(*) FROM public.whose_inventory_snapshots) <> v_inventory_before
    OR (SELECT count(*) FROM public.whose_products) <> v_products_before
    OR (SELECT count(*) FROM public.whose_requests) <> v_requests_before
  THEN RAISE EXCEPTION 'Unexpected operational data change; transaction rolled back'; END IF;
  RAISE NOTICE 'Whose stores verified; new rows inserted: %; THE BOX ICON not activated',v_inserts;
END $whose_activate_verified_stores$;
