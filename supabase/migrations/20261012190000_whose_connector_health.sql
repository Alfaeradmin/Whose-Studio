-- Read-only connector health snapshot, accessible to verified Whose Global Admin.
CREATE OR REPLACE FUNCTION public.whose_connector_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT whose_private.global_admin() THEN
  RAISE EXCEPTION 'Global Admin required' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
  'inbox', (SELECT jsonb_build_object(
     'received',count(*) FILTER(WHERE state='received'),
     'processing',count(*) FILTER(WHERE state='processing'),
     'retry',count(*) FILTER(WHERE state='retry'),
     'quarantined',count(*) FILTER(WHERE state='quarantined'),
     'processed',count(*) FILTER(WHERE state='processed'),
     'oldestPendingAt',min(received_at) FILTER(WHERE state IN ('received','retry','processing')))
     FROM whose_connector.inbox),
  'outbox',(SELECT jsonb_build_object(
     'pending',count(*) FILTER(WHERE state='pending_approval'),
     'ready',count(*) FILTER(WHERE state='ready'),
     'needsReview',count(*) FILTER(WHERE state='needs_review'),
     'verified',count(*) FILTER(WHERE state='verified'))
     FROM whose_connector.outbox),
  'openConflicts',(SELECT count(*) FROM whose_connector.conflicts WHERE state='open'),
  'whosesProducts',(SELECT count(*) FROM public.whose_products),
  'generatedAt',now()
 ) INTO v_result;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.whose_connector_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_connector_health() TO authenticated;
