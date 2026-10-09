-- Dedicated WHOSE Studio security hardening; non-destructive.
-- Keeps the RLS event trigger active; only removes API invocation privileges.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Cover foreign keys used by personnel, request history and stocktake queries.
CREATE INDEX IF NOT EXISTS whose_request_events_actor_idx ON public.whose_request_events(actor_id);
CREATE INDEX IF NOT EXISTS whose_request_lines_product_idx ON public.whose_request_lines(product_id);
CREATE INDEX IF NOT EXISTS whose_request_messages_author_idx ON public.whose_request_messages(author_id);
CREATE INDEX IF NOT EXISTS whose_staff_memberships_branch_idx ON public.whose_staff_memberships(branch_id);
CREATE INDEX IF NOT EXISTS whose_stocktake_scans_product_idx ON public.whose_stocktake_scans(product_id);
CREATE INDEX IF NOT EXISTS whose_stocktake_scans_staff_idx ON public.whose_stocktake_scans(scanned_by);
CREATE INDEX IF NOT EXISTS whose_stocktakes_branch_idx ON public.whose_stocktakes(branch_id);
CREATE INDEX IF NOT EXISTS whose_stocktakes_creator_idx ON public.whose_stocktakes(created_by);

-- The private schema is not exposed via PostgREST, and no anon/authenticated
-- permissions exist for its integration_runs table. Enabling RLS on that table
-- remains a separately reviewed decision because it may block service writers.
