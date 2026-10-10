-- WHOSE STUDIO ONLY, dedicated Supabase project fjauxxunyxxboduyxjyr.
-- Record an owner-approved first administrator. This creates NO Auth user, password,
-- account privileges, branch data, or automatic privilege escalation.
CREATE TABLE IF NOT EXISTS whose_private.initial_admin_onboarding (
  email text PRIMARY KEY,
  intended_role text NOT NULL DEFAULT 'admin' CHECK (intended_role = 'admin'),
  state text NOT NULL DEFAULT 'pending_email_invite'
    CHECK (state IN ('pending_email_invite','invited','verified','activated','cancelled')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  activated_user_id uuid UNIQUE REFERENCES auth.users(id),
  activated_at timestamptz,
  CHECK ((state = 'activated') = (activated_user_id IS NOT NULL AND activated_at IS NOT NULL))
);
ALTER TABLE whose_private.initial_admin_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE whose_private.initial_admin_onboarding FROM PUBLIC, anon, authenticated;
-- Record only owner-provided real email. No trigger and no user-facing RPC exist.
INSERT INTO whose_private.initial_admin_onboarding(email, intended_role)
VALUES ('alfaeradmin@gmail.com','admin')
ON CONFLICT (email) DO NOTHING;
