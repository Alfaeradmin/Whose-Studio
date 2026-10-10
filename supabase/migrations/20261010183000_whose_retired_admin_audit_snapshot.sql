-- WHOSE STUDIO ONLY: fjauxxunyxxboduyxjyr.
-- Snapshot the retired Admin's historic UUID. Keep the existing FK intact.
-- No change to auth.users, operational data, or the active successor account.

DO $gate$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM whose_private.admin_handover h
  JOIN auth.users n ON n.id=h.new_user_id
  JOIN public.whose_staff_profiles np ON np.user_id=n.id
  JOIN whose_private.initial_admin_onboarding ni ON ni.activated_user_id=n.id
  JOIN auth.users o ON o.id=h.previous_user_id
  JOIN public.whose_staff_profiles op ON op.user_id=o.id
  JOIN whose_private.initial_admin_onboarding oi ON oi.email=lower(o.email)
  WHERE h.previous_email='alfaeradmin@gmail.com'
    AND h.new_email='nguyenducnguyen743@gmail.com'
    AND h.state='old_admin_revoked'
    AND h.new_login_verified_at IS NOT NULL
    AND h.old_admin_revoked_at IS NOT NULL
    AND n.email='nguyenducnguyen743@gmail.com'
    AND n.email_confirmed_at IS NOT NULL
    AND n.deleted_at IS NULL AND n.last_sign_in_at IS NOT NULL
    AND np.is_active AND np.is_global_admin AND ni.state='activated'
    AND o.email='alfaeradmin@gmail.com'
    AND o.deleted_at IS NULL
    AND NOT op.is_active AND NOT op.is_global_admin
    AND oi.state='cancelled' AND oi.activated_user_id IS NULL
 ) THEN
   RAISE EXCEPTION 'Whose handover fails required verification; keep retired identity';
 END IF;
END $gate$;

ALTER TABLE whose_private.admin_handover
 ADD COLUMN IF NOT EXISTS previous_user_id_snapshot uuid;

UPDATE whose_private.admin_handover
SET previous_user_id_snapshot=previous_user_id
WHERE new_email='nguyenducnguyen743@gmail.com'
  AND previous_email='alfaeradmin@gmail.com'
  AND state='old_admin_revoked'
  AND previous_user_id IS NOT NULL
  AND previous_user_id_snapshot IS NULL;

ALTER TABLE whose_private.admin_handover
 ALTER COLUMN previous_user_id DROP NOT NULL;

DO $finalize$
DECLARE v_rows integer;
BEGIN
 UPDATE whose_private.admin_handover
 SET previous_user_id=NULL
 WHERE new_email='nguyenducnguyen743@gmail.com'
   AND previous_email='alfaeradmin@gmail.com'
   AND state='old_admin_revoked'
   AND previous_user_id IS NOT NULL
   AND previous_user_id_snapshot=previous_user_id;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'Historical UUID snapshot mismatch'; END IF;
END $finalize$;

ALTER TABLE whose_private.admin_handover
 ADD CONSTRAINT admin_handover_identity_retention_check
 CHECK (previous_user_id IS NOT NULL OR
        (previous_user_id_snapshot IS NOT NULL AND
         state IN ('old_admin_revoked','completed')));
