# WHOSE STUDIO — Stage 8 acceptance and go-live gates

**Never treat a passing unit test as evidence of KiotViet connectivity.** Do not write Kiot stock or business documents in setup.

| Gate | Required evidence | Current |
|---|---|---|
| 8.1 Connector worker | Dedicated server-only service credential configured in the proper preview environment; least privilege; no browser leak | PREVIEW KEY CONFIGURED; one-shot worker reported success; signed event pending |
| 8.2 Provider OAuth | Token response and successful GET branches + products, with secrets redacted | VERIFIED VIA GLOBAL ADMIN UI: branches and products OK |
| 8.3 Initial catalog | Complete bounded pagination, persisted rows, image and price mappings, readback counts, replay no duplicates | 1967 stored; 1967 unique provider IDs and SKUs; independent provider total snapshot pending |
| 8.4 Inbox worker | 1 real signed event, durable ingest, claim, canonical persisted, finish; failure/retry tested | MANUAL EMPTY-INBOX RUN OK; real signed event NOT VERIFIED |
| 8.5 Automatic sync | Valid signature from provider; supervised cron + fallback reconciliation; replay | DISABLED |
| 8.6 Outbox | Per-domain business mapping, approval, idempotency, readback, conflict resolution; signed-off dry-run | DENY-ALL DRY RUN |
| 8.7 Health | Admin-only read access, alerting threshold, reconciler and runbooks | HEALTH RPC PRESENT; ALERTING NOT SET |
| 8.8 Release | Staging rehearsal, review/approval, preview, rollback, smoke test, no unintended inventory deltas | NOT PASSED |

## Required secure setup (do not paste secrets in GitHub or chat)

- Configure `WHOSE_CONNECTOR_SERVICE_ROLE_KEY` **server only** for the correct Whose Supabase project in isolated Preview scope.
- Obtain webhook signing secret via KiotViet's official webhook setup, then set `KIOTVIET_WEBHOOK_SECRET_BASE64` in isolated Preview scope, after verifying its format.
- Confirm `SUPABASE_URL` matches the Whose project `fjauxxunyxxboduyxjyr`.
- Verify production/preview project aliases before enabling a job. Do not assume a READY preview represents production.
- Never log a secret, access token, signing string, full order payload, or customer PII.

## Acceptance tests

1. Read provider branches and one product with read-only GET. Compare ID, SKU, name, image, price and timestamp.
2. Import a bounded page (max 100), read back from Whose, repeat same input twice and compare row counts.
3. Submit a properly signed event once and again, assert deduplication without lost updates.
4. Simulate provider timeout, Supabase 503, lease expiry, duplicate delivery and worker interruption.
5. Ensure pending/failed operations remain traceable and do not issue a Kiot write.
6. Probe protected health endpoint as global admin and ordinary authenticated user; ordinary user must be denied.
7. Preserve a dry-run export + approval audit record before enabling ANY outbound mapping.
8. Production release requires explicit authorization, backup, rollback recipe and a fresh read-only before/after reconciliation.

## Do not enable

- Automatic webhook registration before signed payload samples and replay verification.
- Cron while service key is absent or worker has no functioning persistence.
- Outbound mutation transport, especially inventory updates, on the basis of CI alone.

## Webhook ingress safety gate — 2026-10-12

- Provider GET /webhooks returned **0 subscriptions**; no subscription was created.
- Preview signing secret is configured server-side. Never print or store it in this repository.
- Vercel SSO protects preview deployment URLs. Provider-to-preview callbacks cannot be assumed reachable without a separate deliberate ingress strategy.
- Do **not** disable SSO for all preview pages and do **not** register a per-deployment URL: that URL changes on redeploy.
- Required architecture: a dedicated **stable HTTPS ingress** accessible to the provider, with HMAC verification over the raw request body; reject unsigned/incorrect signatures; durable inbox insert before 2xx; no service-role key in client code; no Kiot write operations.
- Recommended isolation: separate webhook-only project or isolated server/edge ingress with a fixed domain. This project remains a proposal until its access controls and deployment/secret scopes are verified.
- Validate the final URL with an **unauthenticated external POST with an invalid signature**; expected response must come from the application (401), not Vercel SSO. Do not send production-like event payloads during this probe.
- Then validate one authentic provider-signed test event end-to-end, duplicate delivery and failure retry, and only then register/enable provider notifications and worker scheduling.
- Never assume secret existence alone means KiotViet registration or a working event pipeline.

## Deployment discipline

- Keep changes on `feat/kiot-bidirectional-foundation`; run tests before preview release; batch related changes.
- Prefer one reviewable fixed staging URL over pasting each immutable deployment URL to operators.
- Every Vercel deployment is immutable by design; only deploy when integration testing against server environment is required. No production merge without approval.
