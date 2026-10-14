-- Whose Studio Store ↔ Warehouse, v1. REVIEW ONLY; do not auto-apply to production.
-- LVS/NVT are store branches. Warehouse is an internal SHIFT POSITION in each store.
-- No KiotViet stock, invoice or product modifications.
CREATE TABLE IF NOT EXISTS public.whose_ops_shifts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id uuid NOT NULL REFERENCES public.whose_branches(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 duty text NOT NULL CHECK(duty IN ('seller','picker','runner','receiver','lead')),
 zone text NOT NULL DEFAULT 'MAIN' CHECK(zone ~ '^[A-Z0-9_-]{1,32}$'),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 assigned_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at AND ends_at-starts_at<=interval '24 hours'),
 UNIQUE(branch_id,user_id,duty,zone,starts_at)
);
CREATE INDEX IF NOT EXISTS whose_ops_shifts_active_idx ON public.whose_ops_shifts(branch_id,duty,zone,starts_at,ends_at) WHERE is_active;
CREATE TABLE IF NOT EXISTS public.whose_ops_calls(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id uuid NOT NULL REFERENCES public.whose_branches(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 client_key uuid NOT NULL,
 zone text NOT NULL CHECK(zone ~ '^[A-Z0-9_-]{1,32}$'),
 priority smallint NOT NULL DEFAULT 0 CHECK(priority IN (0,1)),
 note text CHECK(length(note)<=500),
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN ('queued','picking','ready','in_transit','delivered','completed','disputed','cancelled')),
 wave_id uuid,
 picker_id uuid REFERENCES auth.users(id),
 runner_id uuid REFERENCES auth.users(id),
 receiver_id uuid REFERENCES auth.users(id),
 version bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz, ready_at timestamptz, handed_at timestamptz,
 delivered_at timestamptz, closed_at timestamptz,
 UNIQUE(created_by,client_key)
);
CREATE INDEX IF NOT EXISTS whose_ops_queue_idx ON public.whose_ops_calls(branch_id,status,zone,priority DESC,created_at,id);
CREATE INDEX IF NOT EXISTS whose_ops_wave_idx ON public.whose_ops_calls(wave_id) WHERE wave_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.whose_ops_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 call_id uuid NOT NULL REFERENCES public.whose_ops_calls(id) ON DELETE RESTRICT,
 sku text NOT NULL CHECK(sku ~ '^[A-Za-z0-9._-]{1,100}$'),
 requested_qty integer NOT NULL CHECK(requested_qty BETWEEN 1 AND 100),
 picked_qty integer NOT NULL DEFAULT 0 CHECK(picked_qty>=0 AND picked_qty<=requested_qty),
 received_qty integer NOT NULL DEFAULT 0 CHECK(received_qty>=0 AND received_qty<=picked_qty),
 shortage_reason text CHECK(length(shortage_reason)<=300),
 UNIQUE(call_id,sku)
);
CREATE INDEX IF NOT EXISTS whose_ops_lines_call_idx ON public.whose_ops_lines(call_id);
CREATE TABLE IF NOT EXISTS public.whose_ops_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 call_id uuid NOT NULL REFERENCES public.whose_ops_calls(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 operation_key uuid,
 action text NOT NULL CHECK(length(action) BETWEEN 1 AND 40),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_id,operation_key)
);
CREATE INDEX IF NOT EXISTS whose_ops_event_call_idx ON public.whose_ops_events(call_id,created_at,id);
ALTER TABLE public.whose_ops_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whose_ops_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whose_ops_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whose_ops_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whose_ops_shifts,public.whose_ops_calls,public.whose_ops_lines,public.whose_ops_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.whose_ops_events_id_seq FROM PUBLIC,anon,authenticated;

-- All business access goes through the small authenticated RPC surface.
CREATE OR REPLACE FUNCTION public.whose_ops_role(p_branch uuid,p_duty text,p_zone text DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT auth.uid() IS NOT NULL
 AND (SELECT whose_private.global_admin() OR whose_private.branch_role(p_branch,ARRAY['admin','manager','warehouse','store']))
 AND EXISTS (
  SELECT 1 FROM public.whose_ops_shifts s
  WHERE s.user_id=auth.uid() AND s.branch_id=p_branch AND s.duty=p_duty
   AND s.is_active AND s.starts_at<=now() AND s.ends_at>now()
   AND (p_zone IS NULL OR s.zone=p_zone OR (s.zone='ALL' AND p_duty IN ('lead','runner','receiver','seller')))
 );
$$;
REVOKE ALL ON FUNCTION public.whose_ops_role(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_role(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.whose_ops_shift_set(
 p_branch uuid,p_user uuid,p_duty text,p_zone text,p_start timestamptz,p_end timestamptz,p_active boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT (whose_private.global_admin()
    OR whose_private.branch_role(p_branch,ARRAY['admin','manager'])) THEN
  RAISE EXCEPTION 'SHIFT_MANAGER_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_duty NOT IN ('seller','picker','runner','receiver','lead')
  OR p_zone !~ '^[A-Z0-9_-]{1,32}$' OR p_start IS NULL OR p_end IS NULL
  OR p_end<=p_start OR p_end-p_start>interval '24 hours'
  OR NOT EXISTS(SELECT 1 FROM public.whose_branches WHERE id=p_branch AND is_active AND kind='store')
  OR NOT EXISTS(SELECT 1 FROM public.whose_staff_memberships
    WHERE user_id=p_user AND branch_id=p_branch AND is_active)
 THEN RAISE EXCEPTION 'INVALID_SHIFT_OR_STAFF' USING ERRCODE='22023';
 END IF;
 -- Prevent two overlapping assignments for the same person & duty, including two zones.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text||p_duty,0));
 IF p_active AND EXISTS(
  SELECT 1 FROM public.whose_ops_shifts
  WHERE branch_id=p_branch AND user_id=p_user AND duty=p_duty AND is_active
   AND tstzrange(starts_at,ends_at,'[)') && tstzrange(p_start,p_end,'[)')
 ) THEN RAISE EXCEPTION 'OVERLAPPING_SHIFT' USING ERRCODE='23505'; END IF;
 INSERT INTO public.whose_ops_shifts(branch_id,user_id,duty,zone,starts_at,ends_at,is_active,assigned_by)
 VALUES(p_branch,p_user,p_duty,p_zone,p_start,p_end,p_active,auth.uid()) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.whose_ops_shift_set(uuid,uuid,text,text,timestamptz,timestamptz,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_shift_set(uuid,uuid,text,text,timestamptz,timestamptz,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.whose_ops_submit(
 p_branch uuid,p_zone text,p_lines jsonb,p_key uuid,p_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_call uuid; v_item jsonb; v_sku text; v_qty integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.whose_ops_role(p_branch,'seller',p_zone) THEN
  RAISE EXCEPTION 'SELLER_SHIFT_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_key IS NULL OR p_zone !~ '^[A-Z0-9_-]{1,32}$'
  OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array'
  OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30
  OR length(coalesce(p_note,''))>500
  OR NOT EXISTS(SELECT 1 FROM public.whose_branches WHERE id=p_branch AND is_active AND kind='store')
 THEN RAISE EXCEPTION 'INVALID_CALL' USING ERRCODE='22023'; END IF;
 -- Fail-fast validation before storing any call, and prevent duplicate SKUs.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x
  WHERE jsonb_typeof(x)<>'object' OR coalesce(x->>'sku','') !~ '^[A-Za-z0-9._-]{1,100}$'
   OR coalesce(x->>'qty','') !~ '^[1-9][0-9]{0,2}$'
   OR (x->>'qty')::integer>100)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x
  GROUP BY upper(x->>'sku') HAVING count(*)>1)
 THEN RAISE EXCEPTION 'INVALID_CALL_LINES' USING ERRCODE='22023'; END IF;
 INSERT INTO public.whose_ops_calls(branch_id,zone,created_by,client_key,note)
 VALUES(p_branch,p_zone,auth.uid(),p_key,p_note)
 ON CONFLICT(created_by,client_key) DO NOTHING RETURNING id INTO v_call;
 IF v_call IS NULL THEN
  SELECT id INTO v_call FROM public.whose_ops_calls
   WHERE created_by=auth.uid() AND client_key=p_key;
  IF v_call IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_RESOLUTION_FAILED'; END IF;
  RETURN v_call;
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  v_sku := v_item->>'sku'; v_qty := (v_item->>'qty')::integer;
  IF NOT EXISTS(SELECT 1 FROM public.whose_products WHERE sku=v_sku AND is_active)
  THEN RAISE EXCEPTION 'SKU_NOT_IN_WHOSE_CATALOG' USING ERRCODE='22023'; END IF;
  INSERT INTO public.whose_ops_lines(call_id,sku,requested_qty) VALUES(v_call,v_sku,v_qty);
 END LOOP;
 INSERT INTO public.whose_ops_events(call_id,actor_id,action,detail)
 VALUES(v_call,auth.uid(),'submitted',jsonb_build_object('lineCount',jsonb_array_length(p_lines)));
 RETURN v_call;
END; $$;
REVOKE ALL ON FUNCTION public.whose_ops_submit(uuid,text,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_submit(uuid,text,jsonb,uuid,text) TO authenticated;

-- Claim 1–8 calls together into a wave, with explicit physical tote per call.
CREATE OR REPLACE FUNCTION public.whose_ops_claim_wave(p_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_count integer; v_wave uuid:=gen_random_uuid(); v_call public.whose_ops_calls%ROWTYPE;
 v_branch uuid;v_zone text;v_seen integer:=0;
BEGIN
 v_count:=coalesce(array_length(p_ids,1),0);
 IF auth.uid() IS NULL OR v_count NOT BETWEEN 1 AND 8
  OR (SELECT count(DISTINCT x) FROM unnest(p_ids) x)<>v_count THEN
  RAISE EXCEPTION 'INVALID_WAVE' USING ERRCODE='22023';
 END IF;
 FOR v_call IN SELECT * FROM public.whose_ops_calls
   WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE NOWAIT
 LOOP
  v_seen:=v_seen+1;
  IF v_call.status<>'queued' THEN RAISE EXCEPTION 'CALL_ALREADY_CLAIMED' USING ERRCODE='40001'; END IF;
  IF v_branch IS NULL THEN v_branch:=v_call.branch_id;v_zone:=v_call.zone;END IF;
  IF v_branch IS DISTINCT FROM v_call.branch_id OR v_zone IS DISTINCT FROM v_call.zone
  THEN RAISE EXCEPTION 'WAVE_MUST_SHARE_BRANCH_AND_ZONE' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF v_seen<>v_count OR NOT public.whose_ops_role(v_branch,'picker',v_zone)
 THEN RAISE EXCEPTION 'PICKER_SHIFT_REQUIRED' USING ERRCODE='42501'; END IF;
 UPDATE public.whose_ops_calls SET status='picking',wave_id=v_wave,
  picker_id=auth.uid(),claimed_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1
 WHERE id=ANY(p_ids);
 INSERT INTO public.whose_ops_events(call_id,actor_id,action,detail)
 SELECT unnest(p_ids),auth.uid(),'claimed',jsonb_build_object('wave',v_wave);
 RETURN v_wave;
END; $$;
REVOKE ALL ON FUNCTION public.whose_ops_claim_wave(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_claim_wave(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.whose_ops_action(
 p_id uuid,p_action text,p_expected_version bigint,p_key uuid,
 p_sku text DEFAULT NULL,p_qty integer DEFAULT NULL,p_reason text DEFAULT NULL,p_lines jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE c public.whose_ops_calls%ROWTYPE; l record; v_item jsonb;
 v_qty integer; v_sku text; v_expected integer; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR p_id IS NULL OR p_action IS NULL OR p_key IS NULL
 THEN RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.whose_ops_calls WHERE id=p_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_CALL' USING ERRCODE='22023'; END IF;
 -- Client can safely retry after an acknowledged write without double-scan.
 IF EXISTS(SELECT 1 FROM public.whose_ops_events WHERE actor_id=auth.uid() AND operation_key=p_key AND call_id=p_id)
 THEN RETURN jsonb_build_object('id',p_id,'status',c.status,'version',c.version,'replayed',true); END IF;
 IF p_expected_version IS NULL OR c.version<>p_expected_version
 THEN RAISE EXCEPTION 'STALE_CALL_VERSION' USING ERRCODE='40001'; END IF;
 IF p_action='scan' THEN
  IF c.status<>'picking' OR c.picker_id<>auth.uid()
   OR NOT public.whose_ops_role(c.branch_id,'picker',c.zone)
  THEN RAISE EXCEPTION 'PICKER_OWNERSHIP_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_qty IS NULL OR p_qty NOT BETWEEN 1 AND 20 OR p_sku IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.whose_ops_lines
     WHERE call_id=p_id AND sku=p_sku AND picked_qty+p_qty<=requested_qty)
  THEN RAISE EXCEPTION 'WRONG_SKU_OR_OVERPICK' USING ERRCODE='22023'; END IF;
  UPDATE public.whose_ops_lines SET picked_qty=picked_qty+p_qty WHERE call_id=p_id AND sku=p_sku;
 ELSIF p_action='short' THEN
  IF c.status<>'picking' OR c.picker_id<>auth.uid()
   OR NOT public.whose_ops_role(c.branch_id,'picker',c.zone) OR length(trim(coalesce(p_reason,'')))<4
   OR NOT EXISTS(SELECT 1 FROM public.whose_ops_lines WHERE call_id=p_id AND sku=p_sku AND picked_qty<requested_qty)
  THEN RAISE EXCEPTION 'SHORTAGE_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
  UPDATE public.whose_ops_lines SET shortage_reason=left(trim(p_reason),300) WHERE call_id=p_id AND sku=p_sku;
 ELSIF p_action='ready' THEN
  IF c.status<>'picking' OR c.picker_id<>auth.uid()
   OR NOT public.whose_ops_role(c.branch_id,'picker',c.zone)
   OR EXISTS(SELECT 1 FROM public.whose_ops_lines
    WHERE call_id=p_id AND picked_qty<requested_qty AND nullif(trim(shortage_reason),'') IS NULL)
  THEN RAISE EXCEPTION 'PICKING_INCOMPLETE' USING ERRCODE='22023'; END IF;
  IF (SELECT coalesce(sum(picked_qty),0) FROM public.whose_ops_lines WHERE call_id=p_id)=0
  THEN RAISE EXCEPTION 'NOTHING_TO_HANDOFF' USING ERRCODE='22023'; END IF;
  UPDATE public.whose_ops_calls SET status='ready',ready_at=clock_timestamp() WHERE id=p_id;
 ELSIF p_action='take' THEN
  IF c.status<>'ready' OR NOT public.whose_ops_role(c.branch_id,'runner',c.zone)
  THEN RAISE EXCEPTION 'RUNNER_SHIFT_REQUIRED' USING ERRCODE='42501'; END IF;
  UPDATE public.whose_ops_calls SET status='in_transit',runner_id=auth.uid(),
   handed_at=clock_timestamp() WHERE id=p_id;
 ELSIF p_action='deliver' THEN
  IF c.status<>'in_transit' OR c.runner_id<>auth.uid()
   OR NOT public.whose_ops_role(c.branch_id,'runner',c.zone)
  THEN RAISE EXCEPTION 'RUNNER_OWNERSHIP_REQUIRED' USING ERRCODE='42501'; END IF;
  UPDATE public.whose_ops_calls SET status='delivered',delivered_at=clock_timestamp() WHERE id=p_id;
 ELSIF p_action='receive' THEN
  IF c.status<>'delivered' OR NOT public.whose_ops_role(c.branch_id,'receiver',c.zone)
   OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array'
   OR jsonb_array_length(p_lines)<>(SELECT count(*) FROM public.whose_ops_lines WHERE call_id=p_id)
  THEN RAISE EXCEPTION 'RECEIVER_SHIFT_OR_LINES_REQUIRED' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) item WHERE
   jsonb_typeof(item)<>'object' OR coalesce(item->>'sku','') !~ '^[A-Za-z0-9._-]{1,100}$'
   OR coalesce(item->>'qty','') !~ '^(0|[1-9][0-9]{0,2})$')
   OR (SELECT count(DISTINCT item->>'sku') FROM jsonb_array_elements(p_lines) item)<>jsonb_array_length(p_lines)
  THEN RAISE EXCEPTION 'INVALID_RECEIVE_LINES' USING ERRCODE='22023'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   v_sku:=v_item->>'sku';v_qty:=(v_item->>'qty')::integer;
   UPDATE public.whose_ops_lines SET received_qty=v_qty
   WHERE call_id=p_id AND sku=v_sku AND v_qty<=picked_qty;
   IF NOT FOUND THEN RAISE EXCEPTION 'OVER_RECEIVE_OR_UNKNOWN_SKU' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.whose_ops_lines WHERE call_id=p_id AND received_qty<>picked_qty) THEN
   IF length(trim(coalesce(p_reason,'')))<4 THEN RAISE EXCEPTION 'RECEIPT_DISCREPANCY_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
   UPDATE public.whose_ops_calls SET status='disputed',receiver_id=auth.uid(),closed_at=clock_timestamp() WHERE id=p_id;
  ELSE
   UPDATE public.whose_ops_calls SET status='completed',receiver_id=auth.uid(),closed_at=clock_timestamp() WHERE id=p_id;
  END IF;
 ELSIF p_action='cancel' THEN
  IF c.status<>'queued' OR c.created_by<>auth.uid()
   OR NOT public.whose_ops_role(c.branch_id,'seller',c.zone)
   OR length(trim(coalesce(p_reason,'')))<4 THEN
   RAISE EXCEPTION 'CANNOT_CANCEL_CLAIMED_CALL' USING ERRCODE='42501'; END IF;
  UPDATE public.whose_ops_calls SET status='cancelled',closed_at=clock_timestamp() WHERE id=p_id;
 ELSE
  RAISE EXCEPTION 'UNSUPPORTED_ACTION' USING ERRCODE='22023';
 END IF;
 UPDATE public.whose_ops_calls SET version=version+1,updated_at=clock_timestamp() WHERE id=p_id;
 INSERT INTO public.whose_ops_events(call_id,actor_id,operation_key,action,detail)
 VALUES(p_id,auth.uid(),p_key,p_action,jsonb_build_object('sku',p_sku,'qty',p_qty,
  'reason',left(coalesce(p_reason,''),300),'wave',c.wave_id));
 RETURN (SELECT jsonb_build_object('id',id,'status',status,'version',version,'wave',wave_id)
  FROM public.whose_ops_calls WHERE id=p_id);
END; $$;
REVOKE ALL ON FUNCTION public.whose_ops_action(uuid,text,bigint,uuid,text,integer,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_action(uuid,text,bigint,uuid,text,integer,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.whose_ops_board(p_branch uuid,p_limit integer DEFAULT 80,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_roles jsonb; v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset NOT BETWEEN 0 AND 10000
  OR NOT (whose_private.global_admin() OR whose_private.branch_role(p_branch,ARRAY['admin','manager','warehouse','store']))
 THEN RAISE EXCEPTION 'NO_BRANCH_ACCESS' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('duty',duty,'zone',zone)), '[]'::jsonb) INTO v_roles
 FROM public.whose_ops_shifts
 WHERE branch_id=p_branch AND user_id=auth.uid() AND is_active
  AND starts_at<=now() AND ends_at>now();
 IF v_roles='[]'::jsonb AND NOT whose_private.global_admin() THEN
  RAISE EXCEPTION 'NO_ACTIVE_SHIFT' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(x.obj),'[]'::jsonb) INTO v_rows FROM (
  SELECT jsonb_build_object('id',c.id,'branch',c.branch_id,'zone',c.zone,
   'priority',c.priority,'status',c.status,'version',c.version,'wave',c.wave_id,
   'picker',c.picker_id,'runner',c.runner_id,'createdBy',c.created_by,
   'createdAt',c.created_at,'updatedAt',c.updated_at,'note',c.note,
   'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('sku',l.sku,
       'requested',l.requested_qty,'picked',l.picked_qty,'received',l.received_qty,
       'shortageReason',l.shortage_reason) ORDER BY l.sku),'[]'::jsonb)
     FROM public.whose_ops_lines l WHERE l.call_id=c.id)) obj
  FROM public.whose_ops_calls c WHERE c.branch_id=p_branch AND
   (whose_private.global_admin() OR EXISTS (
    SELECT 1 FROM public.whose_ops_shifts s
    WHERE s.branch_id=c.branch_id AND s.user_id=auth.uid() AND s.is_active
     AND s.starts_at<=now() AND s.ends_at>now()
     AND (s.zone=c.zone OR s.zone='ALL')
   ))
  ORDER BY CASE WHEN c.status IN ('queued','picking','ready','in_transit','delivered') THEN 0 ELSE 1 END,
   c.priority DESC,c.created_at ASC,c.id
  LIMIT p_limit OFFSET p_offset
 ) x;
 RETURN jsonb_build_object('branch',p_branch,'roles',v_roles,'calls',v_rows,'offset',p_offset,
  'limit',p_limit,'source','whose_ops_database');
END; $$;
REVOKE ALL ON FUNCTION public.whose_ops_board(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_board(uuid,integer,integer) TO authenticated;
