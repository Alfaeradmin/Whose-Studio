-- WHOSE STUDIO ONLY: project fjauxxunyxxboduyxjyr.
-- Owner-approved planned change: alfaeradmin@gmail.com -> nguyenducnguyen743@gmail.com.
-- This migration DOES NOT create an Auth user or grant/revoke any administrator.
-- Never run in ALFAER WMS. Do not insert users/passwords directly into auth.users.

CREATE TABLE IF NOT EXISTS whose_private.admin_handover (
  new_email text PRIMARY KEY,
  previous_email text NOT NULL UNIQUE,
  previous_user_id uuid NOT NULL REFERENCES auth.users(id),
  new_user_id uuid UNIQUE REFERENCES auth.users(id),
  state text NOT NULL DEFAULT 'awaiting_new_auth' CHECK (
    state IN ('awaiting_new_auth','new_auth_verified','new_admin_activated',
              'new_login_verified','old_admin_revoked','completed','cancelled')
  ),
  requested_at timestamptz NOT NULL DEFAULT now(),
  new_admin_activated_at timestamptz,
  new_login_verified_at timestamptz,
  old_admin_revoked_at timestamptz,
  completed_at timestamptz,
  CHECK (new_email <> previous_email)
);
ALTER TABLE whose_private.admin_handover ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE whose_private.admin_handover FROM PUBLIC, anon, authenticated;

DO $handover$
DECLARE
  v_old uuid;
BEGIN
  SELECT u.id INTO STRICT v_old
  FROM auth.users u
  JOIN public.whose_staff_profiles p ON p.user_id = u.id
  JOIN whose_private.initial_admin_onboarding i ON i.activated_user_id = u.id
  WHERE lower(u.email) = 'alfaeradmin@gmail.com'
    AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL
    AND p.is_active AND p.is_global_admin
    AND i.email = 'alfaeradmin@gmail.com' AND i.state = 'activated';

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = 'nguyenducnguyen743@gmail.com')
  THEN
    RAISE EXCEPTION 'New Auth user already exists; verify it before handover preparation';
  END IF;

  INSERT INTO whose_private.admin_handover(
    new_email,previous_email,previous_user_id,state
  ) VALUES (
    'nguyenducnguyen743@gmail.com','alfaeradmin@gmail.com',
    v_old,'awaiting_new_auth'
  )
  ON CONFLICT (new_email) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM whose_private.admin_handover
    WHERE new_email = 'nguyenducnguyen743@gmail.com'
      AND previous_email = 'alfaeradmin@gmail.com'
      AND previous_user_id = v_old AND state = 'awaiting_new_auth'
  ) THEN
    RAISE EXCEPTION 'Admin handover preparation did not match the approved request';
  END IF;
END
$handover$;
