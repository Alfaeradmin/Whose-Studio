# Whose Studio — first administrator bootstrap

## Verified Whose Auth identity (2026-10-10)

- Owner-approved login email: `alfaeradmin@gmail.com`.
- Supabase project: `fjauxxunyxxboduyxjyr` (Whose Studio ONLY).
- Actual Supabase Auth user was invited, email confirmed, and has an observed sign-in.
- Initial private onboarding intent: `whose_private.initial_admin_onboarding`.
- Global admin migration: `20261010120000_whose_verified_global_admin.sql`.
- Scope: global administration across real Whose branches when they exist. No fake branch, stock, or bill.
- The DB predicate `whose_private.global_admin()` verifies current Auth UID, enabled profile, global-admin flag, owner-approved onboarding record, matching confirmed email and an un-deleted Auth user.
- The user's browser is not trusted to claim Admin; API checks `rpc/whose_my_global_admin` using the signed-in bearer, and RLS applies the same DB predicate.
- A regular user with no active branch membership and no global admin verification remains blocked.

## Bootstrap procedure

1. Confirm the approved Auth user ID belongs to the exact confirmed email in Whose Supabase.
2. Apply the global admin migration ONLY to the Whose Supabase project; migration fails closed if verification or owner-approved intent is missing.
3. Verify `whose_staff_profiles.is_global_admin=true`, matching `activated_user_id` and the private onboarding state `activated`.
4. Verify the Whose Auth API allows the approved Admin to sign in even with zero real branches.
5. Verify unapproved users remain unable to see any protected KiotViet data or requests.
6. When real locations are available, import KiotViet branches with their verified IDs and test actual warehouse permissions.

## Remaining release gates

- No employee account password or secret is stored in source control.
- Production is not promoted until end-to-end login and branch-scoped workflow tests succeed.
- KiotViet remains read-only; no fictitious inventory rows, sample branches, or transactions are allowed.

## 4. Verify Vercel Preview

1. Open the latest Preview from branch feat/whose-supabase-backend-foundation of whose-studio.
2. Sign in with the newly authorized staff account, verify email and branch role.
3. Verify signed-out /api/overview and /api/health deny access; /api/backend also requires auth.
4. Confirm correct branch choices; submit one explicitly approved low-impact request for a real SKU between two real branches.
5. Retry with the same idempotency key to ensure no duplicate transaction.
6. Confirm one request, request lines, and audit event in Supabase; no inventory debit or KiotViet write.
7. Test a second limited-role employee to prove RLS scope isolation.

Do not send a real request until the business has approved authentic origin/destination and the test.

## Production release gates

- GitHub Actions green; Vercel Preview READY and live security smoke tests performed.
- Supabase RLS advisor reviewed: the staff-only whose_submit_request SECURITY DEFINER RPC is intentional, while RLS event-trigger function is not accessible to anon or staff.
- At least two genuine users/roles tested; no real data exposed anonymously.
- KiotViet remains read-only; production Whose-only API variables added only after a complete preview validation.
- Merge PR #4 only after approval and testing. Never connect to ALFAER WMS.
