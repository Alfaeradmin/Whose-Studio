-- Authenticated active staff may discover Whose branch destinations for requests.
-- This reveals only the branch directory (no inventory or documents).
CREATE POLICY "active staff can view branch directory"
ON public.whose_branches FOR SELECT TO authenticated
USING (is_active AND (SELECT whose_private.active_staff()));
