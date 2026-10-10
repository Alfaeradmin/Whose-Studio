-- WHOSE STUDIO ONLY: Supabase project fjauxxunyxxboduyxjyr.
-- Finish approved Admin handover only after the former Auth account is gone.
-- Never create/delete Auth users here or alter warehouse, KiotViet, or ALFAER WMS data.
DO $handover_completion$
DECLARE
  v_old_snapshot uuid;
  v_new uuid;
  v_matched integer;
BEGIN
  SELECT h.previous_user_id_snapshot,h.new_user_id
    INTO STRICT v_old_snapshot,v_new
  FROM whose_private.admin_handover h
  WHERE h.previous_email = 'alfaeradmin@gmail.com'
    AND h.new_email = 'nguyenducnguyen743@gmail.com'
    AND h.state = 'old_admin_revoked'
    AND h.completed_at IS NULL
    AND h.previous_user_id IS NULL
    AND h.previous_user_id_snapshot IS NOT NULL
    AND h.new_user_id IS NOT NULL
    AND h.new_login_verified_at IS NOT NULL
    AND h.old_admin_revoked_at IS NOT NULL
  FOR UPDATE;

  IF EXISTS (SELECT 1 FROM auth.users u
             WHERE u.id = v_old_snapshot OR lower(u.email) = 'alfaeradmin@gmail.com') THEN
    RAISE EXCEPTION 'Retired Admin still exists in Auth';
  END IF;

  IF EXISTS (SELECT 1 FROM public.whose_staff_profiles p
             WHERE p.user_id=v_old_snapshot AND (p.is_active OR p.is_global_admin)) THEN
    RAISE EXCEPTION 'Retired Admin retains active staff privileges';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM whose_private.initial_admin_onboarding i
    WHERE i.email='alfaeradmin@gmail.com'
      AND i.state='cancelled'
      AND i.activated_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Retired Admin approval was not cancelled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN public.whose_staff_profiles p ON p.user_id=u.id
    JOIN whose_private.initial_admin_onboarding i ON i.activated_user_id=u.id
    WHERE u.id=v_new
      AND lower(u.email)='nguyenducnguyen743@gmail.com'
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND u.last_sign_in_at IS NOT NULL
      AND p.is_active AND p.is_global_admin
      AND i.email='nguyenducnguyen743@gmail.com'
      AND i.intended_role='admin'
      AND i.state='activated'
  ) THEN
    RAISE EXCEPTION 'Successor Global Admin is not ready';
  END IF;

  IF (SELECT count(*) FROM public.whose_staff_profiles WHERE is_active AND is_global_admin) <> 1 THEN
    RAISE EXCEPTION 'Exactly one active Global Admin is required to finish handover';
  END IF;

  UPDATE whose_private.admin_handover
  SET state='completed',completed_at=now()
  WHERE previous_email='alfaeradmin@gmail.com'
    AND new_email='nguyenducnguyen743@gmail.com'
    AND state='old_admin_revoked'
    AND previous_user_id IS NULL
    AND previous_user_id_snapshot=v_old_snapshot
    AND new_user_id=v_new
    AND completed_at IS NULL;
  GET DIAGNOSTICS v_matched = ROW_COUNT;
  IF v_matched <> 1 THEN
    RAISE EXCEPTION 'Admin handover completion did not match expected state';
  END IF;
END $handover_completion$;
