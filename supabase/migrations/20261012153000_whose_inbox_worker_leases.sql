-- Worker lease and terminal transitions. Server-only; no provider mutation.
ALTER TABLE whose_connector.inbox
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS inbox_worker_due_idx ON whose_connector.inbox(next_attempt_at,received_at)
 WHERE state IN ('received','retry','processing');

CREATE OR REPLACE FUNCTION public.whose_connector_claim_inbox(p_limit integer DEFAULT 20)
RETURNS TABLE(id bigint, retailer text, domain text, entity_key text, lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Service worker only' USING ERRCODE='42501';
 END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Invalid batch limit';
 END IF;
 RETURN QUERY
 WITH picked AS (
  SELECT i.id FROM whose_connector.inbox i
  WHERE ((i.state IN ('received','retry') AND i.next_attempt_at<=now())
    OR (i.state='processing' AND i.lease_until<now()))
    AND i.attempts<8
  ORDER BY i.received_at,i.id
  FOR UPDATE SKIP LOCKED LIMIT p_limit
 ), claimed AS (
  UPDATE whose_connector.inbox i SET state='processing',attempts=i.attempts+1,
    lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds'
  FROM picked p WHERE i.id=p.id
  RETURNING i.id,i.retailer,i.domain,i.entity_key,i.lease_token
 ) SELECT c.id,c.retailer,c.domain,c.entity_key,c.lease_token FROM claimed c;
END $$;

CREATE OR REPLACE FUNCTION public.whose_connector_finish_inbox(
 p_id bigint,p_lease_token uuid,p_success boolean,p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_attempts int;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Service worker only' USING ERRCODE='42501';
 END IF;
 IF p_success IS NULL OR p_id IS NULL OR p_lease_token IS NULL THEN
   RAISE EXCEPTION 'Invalid completion';
 END IF;
 SELECT attempts INTO v_attempts FROM whose_connector.inbox
 WHERE id=p_id AND state='processing' AND lease_token=p_lease_token
   AND lease_until>=now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE whose_connector.inbox SET
  state=CASE WHEN p_success THEN 'processed'
    WHEN v_attempts>=8 THEN 'quarantined' ELSE 'retry' END,
  processed_at=CASE WHEN p_success THEN now() ELSE NULL END,
  last_error_code=CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error_code,'UNKNOWN'),100) END,
  lease_token=NULL,lease_until=NULL,
  next_attempt_at=CASE WHEN p_success THEN now()
    ELSE now()+make_interval(secs=>least(3600,30*power(2,greatest(0,v_attempts-1))::integer)) END
 WHERE id=p_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.whose_connector_claim_inbox(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.whose_connector_finish_inbox(bigint,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whose_connector_claim_inbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.whose_connector_finish_inbox(bigint,uuid,boolean,text) TO service_role;
