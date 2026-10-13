-- Whose Studio connector: durable, idempotent document-page backfill checkpoints.
-- Migration-only; apply after preview validation. Never changes inventory, products or KiotViet.
-- Service-role-only RPCs; Whose Global Admin checks occur at the server endpoint.
CREATE OR REPLACE FUNCTION public.whose_connector_backfill_cursor_status(
  p_retailer text, p_domain text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_cursor jsonb; v_updated timestamptz;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Private connector credential required' USING ERRCODE='42501';
  END IF;
  IF coalesce(p_retailer,'') !~ '^[A-Za-z0-9:_./-]{1,120}$'
    OR coalesce(p_domain,'') NOT IN ('orders','invoices','purchaseorders','transfers','returns') THEN
    RAISE EXCEPTION 'Invalid cursor scope';
  END IF;
  SELECT cursor,updated_at INTO v_cursor,v_updated
  FROM whose_connector.sync_cursors
  WHERE retailer=p_retailer AND domain=p_domain AND scope_key='backfill-documents';
  RETURN jsonb_build_object(
    'nextPage',coalesce((v_cursor->>'nextPage')::integer,0),
    'complete',coalesce((v_cursor->>'complete')::boolean,false),
    'lastTotal',nullif(v_cursor->>'lastTotal','')::integer,
    'lastRows',nullif(v_cursor->>'lastRows','')::integer,
    'updatedAt',v_updated
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.whose_connector_backfill_cursor_advance(
  p_retailer text, p_domain text, p_expected_page integer,
  p_total integer, p_rows integer, p_complete boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_cursor jsonb; v_next jsonb;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Private connector credential required' USING ERRCODE='42501';
  END IF;
  IF coalesce(p_retailer,'') !~ '^[A-Za-z0-9:_./-]{1,120}$'
    OR coalesce(p_domain,'') NOT IN ('orders','invoices','purchaseorders','transfers','returns')
    OR p_expected_page IS NULL OR p_expected_page NOT BETWEEN 0 AND 9999
    OR p_total IS NULL OR p_total NOT BETWEEN 0 AND 500000
    OR p_rows IS NULL OR p_rows <> least(50,greatest(0,p_total-p_expected_page*50))
    OR p_complete IS DISTINCT FROM ((p_expected_page+1)*50>=p_total) THEN
    RAISE EXCEPTION 'Invalid backfill checkpoint';
  END IF;
  v_next := jsonb_build_object('nextPage',p_expected_page+1,
    'complete',p_complete,'lastTotal',p_total,'lastRows',p_rows);
  INSERT INTO whose_connector.sync_cursors
    (retailer,domain,scope_key,cursor,updated_at)
  VALUES (p_retailer,p_domain,'backfill-documents',v_next,clock_timestamp())
  ON CONFLICT (retailer,domain,scope_key)
  DO UPDATE SET cursor=excluded.cursor,updated_at=clock_timestamp()
  WHERE coalesce((whose_connector.sync_cursors.cursor->>'nextPage')::integer,0)=p_expected_page
    AND NOT coalesce((whose_connector.sync_cursors.cursor->>'complete')::boolean,false)
  RETURNING cursor INTO v_cursor;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('advanced',false,'reason','STALE_OR_COMPLETE');
  END IF;
  RETURN jsonb_build_object('advanced',true,'nextPage',p_expected_page+1,
    'complete',p_complete,'lastTotal',p_total,'lastRows',p_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.whose_connector_backfill_cursor_status(text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.whose_connector_backfill_cursor_advance(text,text,integer,integer,integer,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whose_connector_backfill_cursor_status(text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.whose_connector_backfill_cursor_advance(text,text,integer,integer,integer,boolean)
  TO service_role;
