# Whose Studio – first real administrator

Status: UI and backend support password login with Supabase Auth. No user accounts, locations or inventory should be fabricated. Production remains gated until real admin and scoped workflows pass.

## 1. Create the real staff identity

1. Open Whose Studio Supabase project fjauxxunyxxboduyxjyr, never ALFAER WMS.
2. Dashboard → Authentication → Users → Add user or Invite user; use the actual work email of the intended Whose administrator.
3. Have employee activate their account and securely set a password. Do not paste passwords, temporary credentials or access tokens into chat or source code.
4. Copy that employee's actual Auth user UUID from the Dashboard.
5. Consider disabling public Auth signup; the Whose UI has intentionally no self-registration.

## 2. Register a real Whose branch

Table Editor → whose_branches. Add a real business location verified with KiotViet or the business owner:
- name: real branch or warehouse name
- kind: store or warehouse
- kiot_branch_id: verified KiotViet branch ID, if available
- code: unique branch code if available

Do not invent branch identifiers or seed a fictional warehouse. This project is independent from ALFAER WMS.

## 3. Assign staff to an actual branch

In the Whose Studio Table Editor with owner privileges:
- whose_staff_profiles: user_id = real Auth UUID; display_name = verified staff name; is_active = true.
- whose_staff_memberships: user_id = same real Auth UUID; branch_id = actual Whose branch UUID; role = admin; is_active = true.

Auth users without a staff profile and active membership must NOT obtain operational access.

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
