# Whose Studio — backend foundation

This branch is pre-provisioning work; Supabase has not yet been connected.

## Isolation rules

- Provision a dedicated Supabase project. Never point Whose at the ALFAER WMS database.
- KiotViet is read-only. No stock, invoice, transfer or product writes to KiotViet.
- Whose inventory snapshots are reference data and do not change operational stock.
- No fake initial balances, products, employee accounts or orders.
- All runtime keys belong in the Vercel whose-studio project, not GitHub.

## Provisioning checklist

1. Confirm with the owner which Supabase organization to use and acknowledge project cost.
2. Create a separate Whose Studio Supabase project; Singapore (ap-southeast-1) is the proposed region.
3. Verify the target project ID is NOT the ALFAER WMS project.
4. Apply supabase/migrations/20261009153000_whose_backend_foundation.sql to Whose only.
5. Run security and performance advisors, and verify RLS for all whose_* tables.
6. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the Whose Vercel project only.
7. Invite employees through Supabase Auth and bootstrap their profile/membership using trusted administration.
8. Import real branches/products as read-only KiotViet mirrors; verify against source records.
9. Test authenticated branch-scoped access and a draft-to-submitted request using genuine source/destination IDs.
10. Review and merge the PR, then check production readiness after deployment.

## Tables and functions

Public tables: whose_branches, whose_staff_profiles, whose_staff_memberships,
whose_products, whose_inventory_snapshots, whose_requests, whose_request_lines,
whose_request_events, whose_request_messages, whose_stocktakes, whose_stocktake_scans.

Private integration state: whose_private.integration_runs, not exposed through the Data API.

Authenticated user requests are strictly read-scoped by RLS. Normal users cannot write
directly to the tables. The only permitted operational write is RPC whose_submit_request,
which validates staff membership, quantity limits, branches, and retry idempotency.
Submitting a request does not debit, credit or reserve inventory.

## HTTP API

GET /api/system checks Whose-only schema readiness by RPC.
GET /api/backend?resource=branches|products|inventory|requests|request_lines|request_events|request_messages
requires bearer authentication. Inventory requires branch_id; request child tables require request_id.
POST /api/backend?resource=requests requires bearer authentication and validated body:
{ "origin_branch_id": "UUID", "destination_branch_id": "UUID",
  "idempotency_key": "UUID", "lines": [{"sku": "EXAMPLE-SKU", "qty": 1}], "note": "Example" }

## Deferred until onboarding + live database verification

Login UI, live operations screens, employee invitations/management UI, KiotViet mirror
ingestion, realtime notifications, transfer state machine and stocktake reconciliation
are NOT yet active. Do not claim operational readiness from a migration file alone.

Run npm run check before PR merge, then integration-test permissions in the dedicated DB.
