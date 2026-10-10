-- WHOSE STUDIO ONLY: project fjauxxunyxxboduyxjyr. First global administrator.
-- Never run in ALFAER WMS. No synthetic branch, stock, or transaction is created.
-- All changes are atomic; fail closed unless the approved email is fully verified.

ALTER TABLE public.whose_staff_profiles
  ADD COLUMN IF NOT EXISTS is_global_admin boolean NOT NULL DEFAULT false;

-- A global administrator is not just a profile flag: verification AND the
-- private owner's onboarding approval must still be valid at every call.
CREATE OR REPLACE FUNCTION whose_private.global_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
   SELECT 1
   FROM public.whose_staff_profiles p
   JOIN auth.users u ON u.id = p.user_id
   JOIN whose_private.initial_admin_onboarding i ON i.activated_user_id = p.user_id
   WHERE p.user_id = (SELECT auth.uid())
     AND p.is_active AND p.is_global_admin
     AND i.state = 'activated'
     AND lower(i.email) = lower(u.email)
     AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL
 );
$$;
REVOKE ALL ON FUNCTION whose_private.global_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION whose_private.global_admin() TO authenticated;

-- Read-only proof of CURRENT caller's global-admin authorization for the app.
CREATE OR REPLACE FUNCTION public.whose_my_global_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
 SELECT whose_private.global_admin();
$$;
REVOKE ALL ON FUNCTION public.whose_my_global_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whose_my_global_admin() TO authenticated;

-- Keep existing branch membership security intact; add explicit global-admin
-- route to view all real branches and to act on an actual origin branch.
CREATE OR REPLACE FUNCTION whose_private.active_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND (
   whose_private.global_admin() OR EXISTS (
     SELECT 1
     FROM public.whose_staff_memberships m
     JOIN public.whose_staff_profiles p ON p.user_id = m.user_id
     WHERE m.user_id = (SELECT auth.uid()) AND m.is_active AND p.is_active
   )
 );
$$;

CREATE OR REPLACE FUNCTION whose_private.branch_role(
 p_branch uuid, p_roles text[] DEFAULT NULL
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT (SELECT auth.uid()) IS NOT NULL AND (
   whose_private.global_admin() OR EXISTS (
     SELECT 1
     FROM public.whose_staff_memberships m
     JOIN public.whose_staff_profiles p ON p.user_id = m.user_id
     WHERE m.user_id = (SELECT auth.uid()) AND m.branch_id = p_branch
       AND m.is_active AND p.is_active
       AND (p_roles IS NULL OR m.role = ANY(p_roles))
   )
 );
$$;

-- Apply the owner-approved account once, checking the exact verified Auth identity.
DO $bootstrap$
DECLARE
  v_user_id uuid;
  v_existing uuid;
BEGIN
  SELECT u.id INTO STRICT v_user_id
  FROM auth.users u
  WHERE lower(u.email) = 'alfaeradmin@gmail.com'
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL;

  SELECT i.activated_user_id INTO STRICT v_existing
  FROM whose_private.initial_admin_onboarding i
  WHERE i.email = 'alfaeradmin@gmail.com'
    AND i.intended_role = 'admin'
    AND i.state <> 'cancelled';

  IF v_existing IS NOT NULL AND v_existing <> v_user_id THEN
    RAISE EXCEPTION 'existing onboarding identity mismatch';
  END IF;

  INSERT INTO public.whose_staff_profiles(user_id,display_name,is_active,is_global_admin)
  VALUES (v_user_id,'alfaeradmin@gmail.com',true,true)
  ON CONFLICT(user_id) DO UPDATE SET
    is_global_admin = true;

  UPDATE whose_private.initial_admin_onboarding
  SET activated_user_id = v_user_id,
      activated_at = COALESCE(activated_at,now()),
      state = 'activated'
  WHERE email = 'alfaeradmin@gmail.com'
    AND intended_role = 'admin'
    AND (activated_user_id IS NULL OR activated_user_id = v_user_id);

  IF NOT FOUND THEN RAISE EXCEPTION 'onboarding activation did not match'; END IF;
END
$bootstrap$;
