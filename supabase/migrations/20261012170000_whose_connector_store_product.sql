CREATE OR REPLACE FUNCTION public.whose_connector_store_product(p_row jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id bigint; v_sku text; v_name text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Worker only' USING ERRCODE='42501';
 END IF;
 IF p_row IS NULL OR jsonb_typeof(p_row) <> 'object'
  OR (p_row->>'id') !~ '^[0-9]{1,15}$'
  OR jsonb_typeof(p_row->'metadata') <> 'object'
  OR jsonb_typeof(p_row->'active') <> 'boolean'
  OR pg_column_size(p_row)>150000 THEN
  RAISE EXCEPTION 'Invalid product payload';
 END IF;
 v_id := (p_row->>'id')::bigint;
 v_sku := trim(p_row->>'sku');
 v_name := trim(p_row->>'name');
 IF v_id<1 OR length(v_sku) NOT BETWEEN 1 AND 100
 OR length(v_name) NOT BETWEEN 1 AND 500 THEN
  RAISE EXCEPTION 'Invalid product identity';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_sku,0));
 IF EXISTS (SELECT 1 FROM public.whose_products
  WHERE sku=v_sku AND kiot_product_id IS DISTINCT FROM v_id) THEN
  RAISE EXCEPTION 'SKU mapping conflict';
 END IF;
 INSERT INTO public.whose_products(kiot_product_id,sku,name,attributes,is_active,synced_at)
 VALUES(v_id,v_sku,v_name,jsonb_build_object('kiotviet',p_row->'metadata'),
 (p_row->>'active')::boolean,now())
 ON CONFLICT (kiot_product_id) DO UPDATE SET
 sku=EXCLUDED.sku,name=EXCLUDED.name,
 attributes=coalesce(public.whose_products.attributes,'{}'::jsonb)
 || jsonb_build_object('kiotviet',EXCLUDED.attributes->'kiotviet'),
 is_active=EXCLUDED.is_active,synced_at=EXCLUDED.synced_at;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.whose_connector_store_product(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whose_connector_store_product(jsonb) TO service_role;