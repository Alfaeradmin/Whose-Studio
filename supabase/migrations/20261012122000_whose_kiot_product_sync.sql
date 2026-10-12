-- Whose Studio only, project fjauxxunyxxboduyxjyr.
-- KiotViet source catalog import: admin-only, verified server-side rows.
-- Atomic per page, never writes inventory, requests or KiotViet.
CREATE OR REPLACE FUNCTION public.whose_sync_kiot_product_page(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_n int;
  v_duplicates int;
  v_existing int;
  v_written int;
BEGIN
  IF NOT whose_private.global_admin() THEN
    RAISE EXCEPTION 'Global Admin required for Whose product sync' USING ERRCODE='42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Expected a verified Kiot product page';
  END IF;
  v_n := jsonb_array_length(p_rows);
  IF v_n < 1 OR v_n > 100 OR pg_column_size(p_rows) > 1048576 THEN
    RAISE EXCEPTION 'Invalid Kiot product page size';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS t(row)
    WHERE jsonb_typeof(t.row) <> 'object'
      OR jsonb_typeof(t.row->'id') <> 'number'
      OR (t.row->>'id') !~ '^[0-9]{1,15}$'
      OR (t.row->>'id')::bigint < 1
      OR jsonb_typeof(t.row->'sku') <> 'string'
      OR length(trim(t.row->>'sku')) NOT BETWEEN 1 AND 100
      OR jsonb_typeof(t.row->'name') <> 'string'
      OR length(trim(t.row->>'name')) NOT BETWEEN 1 AND 500
      OR jsonb_typeof(t.row->'metadata') <> 'object'
      OR pg_column_size(t.row->'metadata') > 150000
      OR jsonb_typeof(t.row->'active') <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'Invalid product identity or metadata from KiotViet';
  END IF;

  SELECT count(*) - count(DISTINCT (row->>'id')) INTO v_duplicates
  FROM jsonb_array_elements(p_rows) AS t(row);
  IF v_duplicates > 0 THEN RAISE EXCEPTION 'Duplicate Kiot product ID in page'; END IF;
  SELECT count(*) - count(DISTINCT (row->>'sku')) INTO v_duplicates
  FROM jsonb_array_elements(p_rows) AS t(row);
  IF v_duplicates > 0 THEN RAISE EXCEPTION 'Duplicate SKU in Kiot product page'; END IF;

  -- An ID must never silently take ownership of a different existing SKU.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) AS t(row)
    JOIN public.whose_products p ON p.sku = trim(t.row->>'sku')
    WHERE p.kiot_product_id IS DISTINCT FROM (t.row->>'id')::bigint
  ) THEN
    RAISE EXCEPTION 'SKU conflict with an existing Whose product';
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.whose_products p
  JOIN jsonb_array_elements(p_rows) AS t(row) ON p.kiot_product_id=(t.row->>'id')::bigint;

  INSERT INTO public.whose_products(kiot_product_id,sku,name,attributes,is_active,synced_at)
  SELECT (t.row->>'id')::bigint,trim(t.row->>'sku'),trim(t.row->>'name'),
    jsonb_build_object('kiotviet',t.row->'metadata'),(t.row->>'active')::boolean,now()
  FROM jsonb_array_elements(p_rows) AS t(row)
  ON CONFLICT (kiot_product_id) DO UPDATE
  SET sku=EXCLUDED.sku,
      name=EXCLUDED.name,
      -- Keep locally owned metadata outside the KiotViet namespace.
      attributes=coalesce(public.whose_products.attributes,'{}'::jsonb) ||
                 jsonb_build_object('kiotviet',EXCLUDED.attributes->'kiotviet'),
      is_active=EXCLUDED.is_active,
      synced_at=EXCLUDED.synced_at;
  GET DIAGNOSTICS v_written=ROW_COUNT;
  IF v_written <> v_n THEN RAISE EXCEPTION 'Product page write incomplete'; END IF;
  RETURN jsonb_build_object('received',v_n,'created',v_n-v_existing,'updated',v_existing,'stored',v_written);
END
$function$;

CREATE OR REPLACE FUNCTION public.whose_kiot_product_catalog_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT whose_private.active_staff() THEN
    RAISE EXCEPTION 'Whose staff login required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'total',count(*),
    'withImages',count(*) FILTER (WHERE jsonb_array_length(
      CASE WHEN jsonb_typeof(attributes->'kiotviet'->'images')='array'
        THEN attributes->'kiotviet'->'images' ELSE '[]'::jsonb END)>0),
    'active',count(*) FILTER (WHERE is_active),
    'lastSyncedAt',max(synced_at)
  ) INTO v_result
  FROM public.whose_products WHERE kiot_product_id IS NOT NULL;
  RETURN v_result;
END
$function$;

REVOKE ALL ON FUNCTION public.whose_sync_kiot_product_page(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.whose_kiot_product_catalog_stats() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_sync_kiot_product_page(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whose_kiot_product_catalog_stats() TO authenticated;
