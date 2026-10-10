-- WHOSE STUDIO ONLY: fjauxxunyxxboduyxjyr.
-- Defense in depth: no direct table mutation from any client role.
-- Authenticated Global Admin can only import genuine server-fetched Kiot
-- branches through the verified, explicit RPC (not arbitrary PostgREST INSERT).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
 ON public.whose_kiot_branch_directory FROM authenticated;
GRANT SELECT ON public.whose_kiot_branch_directory TO authenticated;
REVOKE ALL ON public.whose_kiot_branch_directory FROM anon;
REVOKE ALL ON FUNCTION public.whose_import_kiot_branches(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.whose_import_kiot_branches(jsonb) TO authenticated;
