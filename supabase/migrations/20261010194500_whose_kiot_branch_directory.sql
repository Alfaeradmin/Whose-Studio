-- Whose Studio only (Supabase fjauxxunyxxboduyxjyr).
-- Source-of-truth staging for REAL KiotViet branches. Do not invent warehouse
-- classification, create operational branches, change inventory or write KiotViet.
CREATE TABLE IF NOT EXISTS public.whose_kiot_branch_directory (
  kiot_branch_id bigint PRIMARY KEY CHECK (kiot_branch_id > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 250),
  code text,
  address text,
  is_active boolean,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  source_synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whose_kiot_branch_directory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whose_kiot_branch_directory FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.whose_kiot_branch_directory TO authenticated;
DROP POLICY IF EXISTS "global admin reads Kiot branch staging" ON public.whose_kiot_branch_directory;
CREATE POLICY "global admin reads Kiot branch staging"
  ON public.whose_kiot_branch_directory
  FOR SELECT TO authenticated
  USING ((SELECT whose_private.global_admin()));

CREATE OR REPLACE FUNCTION public.whose_import_kiot_branches(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $sync$
DECLARE
  v_row jsonb;
  v_id_text text;
  v_id bigint;
  v_name text;
  v_code text;
  v_address text;
  v_is_active boolean;
  v_total integer;
BEGIN
  IF NOT whose_private.global_admin() THEN
    RAISE EXCEPTION 'Whose verified Global Admin required';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Expected list of real KiotViet branches';
  END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total < 1 OR v_total > 1000 THEN
    RAISE EXCEPTION 'KiotViet branch snapshot outside safe bounds';
  END IF;
  FOR v_row IN SELECT x.value FROM jsonb_array_elements(p_rows) AS x(value)
  LOOP
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid KiotViet branch record';
    END IF;
    v_id_text := btrim(COALESCE(v_row->>'id',''));
    v_name := btrim(COALESCE(v_row->>'name',''));
    IF v_id_text !~ '^[1-9][0-9]{0,15}$' OR length(v_name) NOT BETWEEN 1 AND 250 THEN
      RAISE EXCEPTION 'KiotViet branch ID or name invalid';
    END IF;
    v_id := v_id_text::bigint;
    v_code := nullif(btrim(COALESCE(v_row->>'code','')),'');
    v_address := nullif(btrim(COALESCE(v_row->>'address','')),'');
    IF length(v_code) > 100 OR length(v_address) > 1000 THEN
      RAISE EXCEPTION 'KiotViet branch code/address exceeds expected limits';
    END IF;
    v_is_active := CASE
      WHEN jsonb_typeof(v_row->'isActive')='boolean' THEN (v_row->>'isActive')::boolean
      ELSE NULL
    END;
    INSERT INTO public.whose_kiot_branch_directory
      (kiot_branch_id,name,code,address,is_active)
    VALUES (v_id,v_name,v_code,v_address,v_is_active)
    ON CONFLICT(kiot_branch_id) DO UPDATE SET
      name=excluded.name,
      code=excluded.code,
      address=excluded.address,
      is_active=excluded.is_active,
      source_synced_at=now();
  END LOOP;
  RETURN v_total;
END
$sync$;
REVOKE ALL ON FUNCTION public.whose_import_kiot_branches(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_import_kiot_branches(jsonb) TO authenticated;
