-- Whose Studio: inventory pool mapping and verified invoice-to-borrow line provenance.
-- REVIEW / STAGING ONLY. Never change KiotViet or auto-adjust stock.
-- Depends on 20261014094500_whose_store_warehouse_ops.sql.
CREATE TABLE IF NOT EXISTS public.whose_ops_stock_pools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id uuid NOT NULL REFERENCES public.whose_branches(id),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9_-]{1,40}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 kiot_warehouse_id bigint,
 kiot_mapping_verified boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 UNIQUE(branch_id,code), UNIQUE(branch_id,kiot_warehouse_id),
 CHECK (NOT kiot_mapping_verified OR kiot_warehouse_id IS NOT NULL)
);
-- Do not invent Kiot warehouse IDs. A global admin must verify the mapping.
INSERT INTO public.whose_ops_stock_pools(branch_id,code,name)
SELECT id,'LVS_SALES','Kho bán hàng'
FROM public.whose_branches WHERE name='WHOSE STUDIO LVS' AND kind='store'
ON CONFLICT(branch_id,code) DO NOTHING;
INSERT INTO public.whose_ops_stock_pools(branch_id,code,name)
SELECT id,'LVS_STOCK','Kho tồn'
FROM public.whose_branches WHERE name='WHOSE STUDIO LVS' AND kind='store'
ON CONFLICT(branch_id,code) DO NOTHING;
INSERT INTO public.whose_ops_stock_pools(branch_id,code,name)
SELECT id,'NVT_MAIN','Kho Nguyễn Văn Tráng'
FROM public.whose_branches WHERE name='WHOSE STUDIO NVT' AND kind='store'
ON CONFLICT(branch_id,code) DO NOTHING;
ALTER TABLE public.whose_ops_calls ADD COLUMN IF NOT EXISTS stock_pool_id uuid REFERENCES public.whose_ops_stock_pools(id);
CREATE INDEX IF NOT EXISTS whose_ops_pool_queue_idx ON public.whose_ops_calls(stock_pool_id,status,created_at);

-- Resolve physical Whose pool from exact store+zone at creation, never by guesswork.
-- MAIN/BACK were the initial demo zone names; mapping is explicit for each branch.
CREATE OR REPLACE FUNCTION public.whose_ops_call_assign_pool()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $
DECLARE v_code text;v_id uuid;
BEGIN
 SELECT CASE
  WHEN b.name='WHOSE STUDIO LVS' AND NEW.zone='MAIN' THEN 'LVS_SALES'
  WHEN b.name='WHOSE STUDIO LVS' AND NEW.zone='BACK' THEN 'LVS_STOCK'
  WHEN b.name='WHOSE STUDIO NVT' AND NEW.zone='MAIN' THEN 'NVT_MAIN'
  ELSE NULL END INTO v_code
 FROM public.whose_branches b WHERE b.id=NEW.branch_id AND b.is_active AND b.kind='store';
 IF v_code IS NULL THEN RAISE EXCEPTION 'UNKNOWN_BRANCH_POOL' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_id FROM public.whose_ops_stock_pools
 WHERE branch_id=NEW.branch_id AND code=v_code AND active;
 IF v_id IS NULL THEN RAISE EXCEPTION 'UNCONFIGURED_STOCK_POOL' USING ERRCODE='22023'; END IF;
 NEW.stock_pool_id:=v_id;
 RETURN NEW;
END; $;
DROP TRIGGER IF EXISTS whose_ops_call_assign_pool_tg ON public.whose_ops_calls;
CREATE TRIGGER whose_ops_call_assign_pool_tg BEFORE INSERT ON public.whose_ops_calls
 FOR EACH ROW EXECUTE FUNCTION public.whose_ops_call_assign_pool();
REVOKE ALL ON FUNCTION public.whose_ops_call_assign_pool() FROM PUBLIC,anon,authenticated;


CREATE TABLE IF NOT EXISTS public.whose_ops_sales_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 branch_id uuid NOT NULL REFERENCES public.whose_branches(id),
 kiot_invoice_id bigint NOT NULL CHECK(kiot_invoice_id>0),
 invoice_code text NOT NULL CHECK(length(invoice_code) BETWEEN 1 AND 80),
 source_modified_at timestamptz NOT NULL,
 purchased_at timestamptz NOT NULL,
 provider_status text NOT NULL CHECK(provider_status IN ('finalized','voided','unknown')),
 warehouse_id bigint,
 source_verified boolean NOT NULL DEFAULT false,
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(kiot_invoice_id)
);
CREATE INDEX IF NOT EXISTS whose_ops_sales_by_branch_idx
 ON public.whose_ops_sales_documents(branch_id,purchased_at,kiot_invoice_id);
CREATE TABLE IF NOT EXISTS public.whose_ops_sales_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES public.whose_ops_sales_documents(id),
 kiot_line_id bigint,
 sku text NOT NULL CHECK(sku ~ '^[A-Za-z0-9._-]{1,100}$'),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100000),
 UNIQUE(invoice_id,sku)
);
-- A confirmed match is an allocation of a specific invoice SKU quantity
-- to a specific borrowed SKU quantity, NOT merely 'both contain the same SKU'.
CREATE TABLE IF NOT EXISTS public.whose_ops_sales_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_line_id uuid NOT NULL REFERENCES public.whose_ops_sales_lines(id),
 borrow_line_id uuid NOT NULL REFERENCES public.whose_ops_lines(id),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100000),
 confirmed_by uuid NOT NULL REFERENCES auth.users(id),
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 client_key uuid NOT NULL,
 UNIQUE(confirmed_by,client_key),
 UNIQUE(invoice_line_id,borrow_line_id)
);
CREATE INDEX IF NOT EXISTS whose_ops_match_by_borrow_idx ON public.whose_ops_sales_matches(borrow_line_id);
CREATE TABLE IF NOT EXISTS public.whose_ops_return_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 borrow_line_id uuid NOT NULL REFERENCES public.whose_ops_lines(id),
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100000),
 received_by uuid NOT NULL REFERENCES auth.users(id),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(length(reason) BETWEEN 4 AND 300),
 client_key uuid NOT NULL,
 UNIQUE(received_by,client_key)
);
CREATE INDEX IF NOT EXISTS whose_ops_returns_by_borrow_idx ON public.whose_ops_return_receipts(borrow_line_id);

ALTER TABLE public.whose_ops_stock_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whose_ops_sales_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whose_ops_sales_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whose_ops_sales_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whose_ops_return_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whose_ops_stock_pools,public.whose_ops_sales_documents,
 public.whose_ops_sales_lines,public.whose_ops_sales_matches,public.whose_ops_return_receipts
 FROM PUBLIC,anon,authenticated;

-- Read-only record-level account view; errors deny entire request, not private invoice data.
CREATE OR REPLACE FUNCTION public.whose_ops_bill_history(p_call uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE c public.whose_ops_calls%ROWTYPE; v_lines jsonb;v_matches jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.whose_ops_calls WHERE id=p_call;
 IF NOT FOUND OR NOT (whose_private.global_admin() OR
  (whose_private.branch_role(c.branch_id,ARRAY['admin','manager','warehouse','store']) AND EXISTS(
   SELECT 1 FROM public.whose_ops_shifts sh WHERE sh.user_id=auth.uid()
    AND sh.branch_id=c.branch_id AND sh.is_active AND sh.starts_at<=now() AND sh.ends_at>now()
    AND (sh.zone=c.zone OR sh.zone='ALL')))) THEN
  RAISE EXCEPTION 'NO_CALL_ACCESS' USING ERRCODE='42501'; END IF;
 -- Requestor/store and warehouse see only source invoice codes, SKU, quantities and status;
 -- no customer personal information is persisted or returned.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'lineId',l.id,'sku',l.sku,'picked',l.picked_qty,'received',l.received_qty,
  'sold',coalesce((SELECT sum(m.quantity) FROM public.whose_ops_sales_matches m
   WHERE m.borrow_line_id=l.id),0),
  'returned',coalesce((SELECT sum(r.quantity) FROM public.whose_ops_return_receipts r
   WHERE r.borrow_line_id=l.id),0),
  'matchedBills',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'code',d.invoice_code,'invoiceId',d.kiot_invoice_id,'qty',m.quantity,
   'purchasedAt',d.purchased_at,'status',d.provider_status))
   FROM public.whose_ops_sales_matches m
   JOIN public.whose_ops_sales_lines sl ON sl.id=m.invoice_line_id
   JOIN public.whose_ops_sales_documents d ON d.id=sl.invoice_id
   WHERE m.borrow_line_id=l.id),'[]'::jsonb)
  ) ORDER BY l.sku),'[]'::jsonb) INTO v_lines
 FROM public.whose_ops_lines l WHERE l.call_id=c.id;
 RETURN jsonb_build_object('callId',c.id,'branchId',c.branch_id,'lines',v_lines,
  'hasVerifiedPool',EXISTS(SELECT 1 FROM public.whose_ops_stock_pools p
   WHERE p.id=c.stock_pool_id AND p.kiot_mapping_verified),
  'source','whose_confirmed_invoice_allocations');
END $$;
REVOKE ALL ON FUNCTION public.whose_ops_bill_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_bill_history(uuid) TO authenticated;

-- Service role import is built separately and MUST upsert invoice+lines transactionally.
-- App users cannot write provider documents or mark a document verified.
COMMENT ON TABLE public.whose_ops_sales_documents IS
 'Verified KiotViet invoice metadata, populated only by a signed import worker after source detail validation. No customer PII.';

-- Never auto-confirm a match solely by SKU. Double-lock the borrow and invoice lines;
-- both allocation totals are checked in a single database transaction.
CREATE OR REPLACE FUNCTION public.whose_ops_confirm_bill_line(
 p_borrow_line uuid,p_invoice_line uuid,p_qty integer,p_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE bl public.whose_ops_lines%ROWTYPE; il public.whose_ops_sales_lines%ROWTYPE;
 c public.whose_ops_calls%ROWTYPE; d public.whose_ops_sales_documents%ROWTYPE;
 used_borrow integer; used_invoice integer; returns_qty integer; v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR p_key IS NULL OR p_qty NOT BETWEEN 1 AND 100000
 THEN RAISE EXCEPTION 'INVALID_MATCH_INPUT' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_id FROM public.whose_ops_sales_matches
 WHERE confirmed_by=auth.uid() AND client_key=p_key;
 IF FOUND THEN RETURN v_id; END IF;
 SELECT * INTO bl FROM public.whose_ops_lines WHERE id=p_borrow_line FOR UPDATE;
 SELECT * INTO il FROM public.whose_ops_sales_lines WHERE id=p_invoice_line FOR UPDATE;
 IF bl.id IS NULL OR il.id IS NULL OR upper(bl.sku)<>upper(il.sku)
 THEN RAISE EXCEPTION 'SKU_OR_SOURCE_LINE_MISMATCH' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.whose_ops_calls WHERE id=bl.call_id;
 SELECT * INTO d FROM public.whose_ops_sales_documents WHERE id=il.invoice_id;
 IF d.id IS NULL OR NOT d.source_verified OR d.provider_status<>'finalized'
  OR d.branch_id<>c.branch_id OR d.purchased_at<c.created_at
  OR d.purchased_at>c.created_at+interval '7 days'
  OR c.status NOT IN ('delivered','completed','disputed')
  OR NOT (whose_private.global_admin() OR
   public.whose_ops_role(c.branch_id,'seller',c.zone) OR
   public.whose_ops_role(c.branch_id,'lead',c.zone))
 THEN RAISE EXCEPTION 'NOT_ELIGIBLE_FOR_BILL_MATCH' USING ERRCODE='42501'; END IF;
 IF d.warehouse_id IS NOT NULL AND
  NOT EXISTS(SELECT 1 FROM public.whose_ops_stock_pools sp
   WHERE sp.id=c.stock_pool_id AND sp.kiot_mapping_verified AND
    sp.kiot_warehouse_id=d.warehouse_id)
 THEN RAISE EXCEPTION 'WAREHOUSE_MISMATCH' USING ERRCODE='22023'; END IF;
 SELECT coalesce(sum(quantity),0) INTO used_borrow FROM public.whose_ops_sales_matches
 WHERE borrow_line_id=bl.id;
 SELECT coalesce(sum(quantity),0) INTO used_invoice FROM public.whose_ops_sales_matches
 WHERE invoice_line_id=il.id;
 SELECT coalesce(sum(quantity),0) INTO returns_qty FROM public.whose_ops_return_receipts
 WHERE borrow_line_id=bl.id;
 IF used_borrow+returns_qty+p_qty>
   CASE WHEN c.status='delivered' THEN bl.picked_qty ELSE bl.received_qty END
  OR used_invoice+p_qty>il.quantity
 THEN RAISE EXCEPTION 'MATCH_QUANTITY_EXCEEDS_AVAILABLE' USING ERRCODE='22023'; END IF;
 INSERT INTO public.whose_ops_sales_matches(invoice_line_id,borrow_line_id,quantity,confirmed_by,client_key)
 VALUES(il.id,bl.id,p_qty,auth.uid(),p_key) RETURNING id INTO v_id;
 INSERT INTO public.whose_ops_events(call_id,actor_id,action,detail)
 VALUES(c.id,auth.uid(),'bill_line_confirmed',jsonb_build_object(
 'invoiceId',d.kiot_invoice_id,'invoiceCode',d.invoice_code,'sku',bl.sku,'quantity',p_qty));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.whose_ops_confirm_bill_line(uuid,uuid,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_confirm_bill_line(uuid,uuid,integer,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.whose_ops_record_return(
 p_borrow_line uuid,p_qty integer,p_reason text,p_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE bl public.whose_ops_lines%ROWTYPE;c public.whose_ops_calls%ROWTYPE;
 sold integer;returned integer;v_id uuid;available integer;
BEGIN
 IF auth.uid() IS NULL OR p_key IS NULL OR p_qty NOT BETWEEN 1 AND 100000
  OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 4 AND 300
 THEN RAISE EXCEPTION 'INVALID_RETURN_INPUT' USING ERRCODE='22023'; END IF;
 SELECT id INTO v_id FROM public.whose_ops_return_receipts
  WHERE received_by=auth.uid() AND client_key=p_key;
 IF FOUND THEN RETURN v_id; END IF;
 SELECT * INTO bl FROM public.whose_ops_lines WHERE id=p_borrow_line FOR UPDATE;
 IF bl.id IS NULL THEN RAISE EXCEPTION 'UNKNOWN_BORROW_LINE' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM public.whose_ops_calls WHERE id=bl.call_id;
 IF c.status NOT IN ('delivered','completed','disputed') OR NOT
  (whose_private.global_admin() OR public.whose_ops_role(c.branch_id,'picker',c.zone)
  OR public.whose_ops_role(c.branch_id,'lead',c.zone))
 THEN RAISE EXCEPTION 'RETURN_RECEIVER_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(sum(quantity),0) INTO sold FROM public.whose_ops_sales_matches
  WHERE borrow_line_id=bl.id;
 SELECT coalesce(sum(quantity),0) INTO returned FROM public.whose_ops_return_receipts
  WHERE borrow_line_id=bl.id;
 available:=(CASE WHEN c.status='delivered' THEN bl.picked_qty ELSE bl.received_qty END)-sold-returned;
 IF available<p_qty THEN RAISE EXCEPTION 'RETURN_EXCEEDS_UNSOLD_BORROW' USING ERRCODE='22023'; END IF;
 INSERT INTO public.whose_ops_return_receipts(borrow_line_id,quantity,received_by,reason,client_key)
 VALUES(bl.id,p_qty,auth.uid(),trim(p_reason),p_key) RETURNING id INTO v_id;
 INSERT INTO public.whose_ops_events(call_id,actor_id,action,detail)
 VALUES(c.id,auth.uid(),'borrow_returned',jsonb_build_object('sku',bl.sku,'qty',p_qty));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.whose_ops_record_return(uuid,integer,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_ops_record_return(uuid,integer,text,uuid) TO authenticated;
