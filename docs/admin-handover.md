# Whose Studio — safe global admin handover

Authorized transition: `alfaeradmin@gmail.com` → `nguyenducnguyen743@gmail.com`.

**Project boundary:** only Supabase project `fjauxxunyxxboduyxjyr` / GitHub `Alfaeradmin/Whose-Studio`. Never change ALFAER WMS.

## Stage 1 — prepare (no privilege changes)

Apply migration `20261010143000_whose_admin_handover_preparation.sql`.
It creates a private RLS-protected handover record in `whose_private.admin_handover`, with `state = 'awaiting_new_auth'`. No Auth users, passwords, profiles, branch memberships, stock or KiotViet data are created or modified. Existing Admin retains privileges throughout.

## Stage 2 — create the new Auth identity (the owner performs)

Go to https://supabase.com/dashboard/project/fjauxxunyxxboduyxjyr/auth/users and use **Add user → Create new user** (NOT "Invite user" if direct password setup is available). Enter `nguyenducnguyen743@gmail.com` and a strong password directly in the Supabase Dashboard, never in ChatGPT or GitHub. Do not create the new user via direct SQL against `auth.users`.

Verify the **new user's real Auth UUID**, confirmed email (`email_confirmed_at IS NOT NULL`), active state and that the owner controls the account. The email delivery rate limit is not a reason to bypass proof of identity.

## Stage 3 — promote the new administrator while keeping the old

Once the new real Auth user is independently verified, apply the separately reviewed and guarded promotion. This must:
- match the exact newly confirmed Auth email and UUID;
- require the pre-approved handover record and current active old Admin;
- create the new staff profile, an activated onboarding record, and global-admin grant in one atomic transaction;
- record the new UUID and transition state `new_admin_activated`;
- **not** revoke, delete, or modify the previous Admin.

The global-admin SQL function already supports multiple individually approved verified users. No branch or dummy membership is required.

## Stage 4 — verify successful sign-in

The owner signs in with the new email and password on Whose Studio Preview. Verify real app authentication and the `Quản trị toàn hệ thống` role with the server-verified `is_global_admin=true`. Confirm signed-out requests are still denied and no branch or stock data has changed. Record `new_login_verified` only after confirmed end-to-end sign-in. Merely seeing an Auth user or sign-in timestamp does not prove application-level authorization.

## Stage 5 — revoke/delete former administrator LAST

Only after Stage 4, revoke old global-admin privileges and change old onboarding approval to cancelled in one guarded transaction. Independently confirm the new Global Admin is still effective. Then remove the old Whose Studio Auth user using the Supabase Auth **Dashboard or Admin API**, never by raw SQL against `auth.users`; consider FK/audit retention before deletion. Do not delete the Gmail mailbox, other Supabase project accounts, audit history or any ALFAER WMS resource.

Any failed stage: stop and leave the old Admin available for recovery. Production release remains gated to a tested login and reviewed code merge.

## Actual verified status — 2026-10-10

- New Auth user has a verified email and an observed successful sign-in AFTER Global Admin activation. The owner also confirmed an end-to-end successful Whose Studio login.
- The new Admin has an active approved onboarding identity and is the **only** active Global Admin.
- Former Whose Admin was revoked by migration `whose_retire_old_global_admin`: staff profile disabled, global-admin flag cleared, onboarding approval cancelled. Old Auth identity record is still retained; handover state is `old_admin_revoked`.
- The old Auth identity **must not be removed yet**. The private table `whose_private.admin_handover.previous_user_id` currently has a non-nullable foreign key to `auth.users`, so removal may violate referential integrity. Before final removal, create a reviewed migration to retain the old UUID in an immutable audit snapshot and adjust only the live foreign-key reference. Recheck other request/audit FKs first.
- Only after the referential integrity migration passes CI and has been verified in Whose Supabase should the owner remove the old identity through Authentication → Users. Finally independently confirm the old identity is gone, the new Admin still functions, and the handover can be marked `completed`.
- Nothing has been merged to Production and no KiotViet or inventory mutations were made.
