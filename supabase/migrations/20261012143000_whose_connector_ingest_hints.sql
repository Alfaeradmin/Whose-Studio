-- Whose webhook durable ingestion. Service-role-only RPC; no public writes or provider mutations.
CREATE OR REPLACE FUNCTION public.whose_connector_ingest_hints(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_total integer; v_inserted integer; v_mismatch integer;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Connector worker authorization required' USING ERRCODE='42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Invalid event batch'; END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total > 500 OR pg_column_size(p_rows) > 131072 THEN RAISE EXCEPTION 'Event batch too large'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS x(item)
    WHERE jsonb_typeof(x.item) <> 'object'
       OR coalesce(x.item->>'retailer','') !~ '^[A-Za-z0-9:_./-]{1,120}$'
       OR coalesce(x.item->>'domain','') NOT IN ('products','branches','orders','invoices','transfers','returns','purchaseorders','ordersuppliers')
       OR coalesce(x.item->>'entity_key','') !~ '^[A-Za-z0-9:_./-]{1,160}$'
       OR coalesce(x.item->>'event_key','') !~ '^[a-f0-9]{64}$'
       OR coalesce(x.item->>'payload_digest','') !~ '^[a-f0-9]{64}$'
  ) THEN RAISE EXCEPTION 'Invalid connector event identity'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS x(item)
    GROUP BY item->>'retailer',item->>'event_key'
    HAVING count(DISTINCT item->>'payload_digest') > 1
  ) THEN RAISE EXCEPTION 'Conflicting event keys in batch'; END IF;
  -- A replay carrying different content is a conflict, not a success.
  SELECT count(*) INTO v_mismatch
    FROM jsonb_array_elements(p_rows) AS x(item)
    JOIN whose_connector.inbox i
      ON i.retailer=x.item->>'retailer' AND i.event_key=x.item->>'event_key'
    WHERE i.payload_digest IS DISTINCT FROM x.item->>'payload_digest';
  IF v_mismatch > 0 THEN RAISE EXCEPTION 'Event replay digest mismatch'; END IF;
  INSERT INTO whose_connector.inbox(retailer,event_key,domain,entity_key,payload_digest)
  SELECT DISTINCT item->>'retailer',item->>'event_key',item->>'domain',item->>'entity_key',item->>'payload_digest'
  FROM jsonb_array_elements(p_rows) AS x(item)
  ON CONFLICT (retailer,event_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object('received',v_total,'inserted',v_inserted,'duplicates',v_total-v_inserted);
END
$fn$;
REVOKE ALL ON FUNCTION public.whose_connector_ingest_hints(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whose_connector_ingest_hints(jsonb) TO service_role;
