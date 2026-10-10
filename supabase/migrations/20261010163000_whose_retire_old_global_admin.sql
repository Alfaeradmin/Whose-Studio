-- WHOSE STUDIO ONLY: Supabase fjauxxunyxxboduyxjyr.
-- Guarded and atomic: record successful new sign-in, revoke old global Admin.
-- Do NOT delete auth.users, credentials, requests, audit or inventory in this migration.
DO $handover_retire$
DECLARE
  v_new uuid;
  v_old uuid;
  v_sign_in timestamptz;
  v_activated timestamptz;
BEGIN
  SELECT h.new_user_id,h.previous_user_id,h.new_admin_activated_at
    INTO STRICT v_new,v_old,v_activated
  FROM whose_private.admin_handover h
  WHERE h.new_email='nguyenducnguyen743@gmail.com'
    AND h.previous_email='alfaeradmin@gmail.com'
    AND h.state='new_admin_activated'
    AND h.new_login_verified_at IS NULL
    AND h.old_admin_revoked_at IS NULL
  FOR UPDATE;
  IF v_new IS NULL OR v_old IS NULL OR v_new=v_old OR v_activated IS NULL THEN
    RAISE EXCEPTION 'Approved Whose handover identities not ready';
  END IF;

  -- Require the *new* verified user to have genuinely signed in after privilege promotion.
  SELECT u.last_sign_in_at INTO STRICT v_sign_in
  FROM auth.users u
  JOIN public.whose_staff_profiles p ON p.user_id=u.id
  JOIN whose_private.initial_admin_onboarding i ON i.activated_user_id=u.id
  WHERE u.id=v_new
    AND lower(u.email)='nguyenducnguyen743@gmail.com'
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL
    AND u.last_sign_in_at >= v_activated
    AND p.is_active AND p.is_global_admin
    AND i.email='nguyenducnguyen743@gmail.com'
    AND i.intended_role='admin' AND i.state='activated';

  -- Independent current-state check before touching the previous Admin.
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.whose_staff_profiles p ON p.user_id=u.id
    JOIN whose_private.initial_admin_onboarding i ON i.activated_user_id=u.id
    WHERE u.id=v_old
      AND lower(u.email)='alfaeradmin@gmail.com'
      AND u.deleted_at IS NULL
      AND p.is_active AND p.is_global_admin
      AND i.email='alfaeradmin@gmail.com' AND i.state='activated'
  ) THEN
    RAISE EXCEPTION 'Previous admin state changed; stop to preserve recovery';
  END IF;

  UPDATE whose_private.admin_handover
  SET new_login_verified_at=now(), state='new_login_verified'
  WHERE new_email='nguyenducnguyen743@gmail.com' AND new_user_id=v_new
    AND state='new_admin_activated';
  IF NOT FOUND THEN RAISE EXCEPTION 'Could not log verified sign-in'; END IF;

  UPDATE public.whose_staff_profiles p
  SET is_global_admin=false,is_active=false
  WHERE p.user_id=v_old AND p.is_global_admin AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Could not deactivate previous Whose profile'; END IF;

  -- The onboarding check requires null activated fields for cancelled records.
  UPDATE whose_private.initial_admin_onboarding i
  SET state='cancelled',activated_user_id=NULL,activated_at=NULL
  WHERE i.email='alfaeradmin@gmail.com' AND i.state='activated'
    AND i.activated_user_id=v_old;
  IF NOT FOUND THEN RAISE EXCEPTION 'Could not revoke previous approval'; END IF;

  UPDATE whose_private.admin_handover
  SET state='old_admin_revoked',old_admin_revoked_at=now()
  WHERE new_email='nguyenducnguyen743@gmail.com'
    AND state='new_login_verified' AND new_user_id=v_new
    AND previous_user_id=v_old;
  IF NOT FOUND THEN RAISE EXCEPTION 'Could not finalize revocation record'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.whose_staff_profiles p ON p.user_id=u.id
    JOIN whose_private.initial_admin_onboarding i ON i.activated_user_id=u.id
    WHERE u.id=v_new AND u.deleted_at IS NULL AND p.is_active
      AND p.is_global_admin AND i.state='activated'
  ) THEN RAISE EXCEPTION 'Incoming Admin lost authorization'; END IF;
END
$handover_retire$;
