-- WHOSE STUDIO ONLY, dedicated project fjauxxunyxxboduyxjyr.
-- Verify and promote owner-approved incoming Admin, WITHOUT revoking or deleting old Admin.
-- Auth user/password must be created legitimately via Supabase Auth, never SQL.
DO $handover_promotion$
DECLARE
  v_old_id uuid;
  v_new_id uuid;
  v_state text;
BEGIN
  SELECT h.previous_user_id, h.state
    INTO STRICT v_old_id, v_state
  FROM whose_private.admin_handover h
  WHERE h.previous_email = 'alfaeradmin@gmail.com'
    AND h.new_email = 'nguyenducnguyen743@gmail.com'
  FOR UPDATE;

  IF v_state NOT IN ('awaiting_new_auth','new_auth_verified','new_admin_activated') THEN
    RAISE EXCEPTION 'Whose admin handover not in a promotable state';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.whose_staff_profiles p ON p.user_id=u.id
    JOIN whose_private.initial_admin_onboarding i ON i.activated_user_id=u.id
    WHERE u.id = v_old_id
      AND lower(u.email) = 'alfaeradmin@gmail.com'
      AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
      AND p.is_active AND p.is_global_admin
      AND i.state = 'activated' AND i.email = 'alfaeradmin@gmail.com'
  ) THEN
    RAISE EXCEPTION 'Previous Whose administrator is not active; do not promote blindly';
  END IF;

  SELECT u.id INTO STRICT v_new_id
  FROM auth.users u
  WHERE lower(u.email) = 'nguyenducnguyen743@gmail.com'
    AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL;

  IF v_new_id = v_old_id THEN
    RAISE EXCEPTION 'Old and new administrator identities unexpectedly match';
  END IF;

  IF EXISTS (
    SELECT 1 FROM whose_private.initial_admin_onboarding i
    WHERE i.email = 'nguyenducnguyen743@gmail.com'
      AND (i.activated_user_id IS DISTINCT FROM v_new_id
       OR i.state <> 'activated' OR i.intended_role <> 'admin')
  ) THEN
    RAISE EXCEPTION 'New administrator onboarding record conflicts with approved identity';
  END IF;

  INSERT INTO public.whose_staff_profiles(user_id,display_name,is_active,is_global_admin)
  VALUES (v_new_id,'nguyenducnguyen743@gmail.com',true,true)
  ON CONFLICT(user_id) DO UPDATE SET
    is_active=true,
    is_global_admin=true;

  INSERT INTO whose_private.initial_admin_onboarding (
    email,intended_role,state,activated_user_id,activated_at
  ) VALUES (
    'nguyenducnguyen743@gmail.com','admin','activated',v_new_id,now()
  )
  ON CONFLICT (email) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM whose_private.initial_admin_onboarding i
    WHERE i.email = 'nguyenducnguyen743@gmail.com'
      AND i.activated_user_id = v_new_id
      AND i.state = 'activated'
  ) THEN
    RAISE EXCEPTION 'Failed to activate approved incoming administrator';
  END IF;

  UPDATE whose_private.admin_handover
  SET new_user_id=v_new_id,
      new_admin_activated_at=COALESCE(new_admin_activated_at,now()),
      state='new_admin_activated'
  WHERE new_email='nguyenducnguyen743@gmail.com'
    AND previous_user_id=v_old_id
    AND (new_user_id IS NULL OR new_user_id=v_new_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handover record changed during promotion';
  END IF;
END
$handover_promotion$;
