# Whose Studio ↔ KiotViet: integration-first platform

Status: DESIGN + FOUNDATION; outbound mutations **DISABLED**. This document is a contract, not a claim of deployed bidirectional sync.

## Core rules

1. KiotViet authoritative for retail products, prices, branch inventory, orders/invoices and Kiot-created vouchers until an explicit per-field ownership decision is made.
2. Whose may own internal workflows, bin/location/custody and audit data. No local movement may implicitly POST/PUT stock to KiotViet.
3. Every outbound write requires: approved capability, mapped branch/product identities, scoped staff/service authorization, unique business operation key, expected source version where possible, durable outbox record, operator audit and post-write readback. Default DENY.
4. No write on webhook arrival. Webhook = authenticated hint -> inbox -> deduplicate -> fetch canonical object -> merge. Periodic reconciliation recovers missed events. Avoid reflecting own outgoing changes back as new writes.
5. No synthetic counts, timestamps, stock or photos. Never interpret an HTTP 200 response alone as complete sync.

## Capability matrix (must be verified with actual Kiot retailer permissions)

| Domain | Kiot read | Kiot write API documented | Whose write policy at launch |
| --- | --- | --- | --- |
| Branches | GET branches | not assumed | DENY |
| Products/images/prices | GET products | create/update documented | DENY until mapping + conflict tests |
| Inventory | GET products inventories/productOnHands | product inventory updates may affect counts | DENY; only explicitly approved inventory adjustment workflow |
| Orders | GET orders | create/update/cancel documented | DENY until business workflow exists |
| Invoices/returns | GET invoices/returns | invoice writes documented | DENY until reconciliation built |
| Transfers | GET transfers | POST/PUT documented | DENY until branch and line custody rules proven |
| Purchase orders/supplier orders | endpoint-specific GET | verify before writes | DENY |
| Webhooks | GET/POST webhooks documented | subscription administration only | gated through reviewed registration |

KiotViet Retail reference: https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-ket-noi-api/public-api/

## Inbound flow

1. Bootstrap by type and branch with paginated cursor/checkpoint (resume support).
2. Poll delta by provider modified date where supported; hold overlap window and record source ID + version.
3. Webhook receiver: raw-body signature validation (when configured); accept quick and persist minimal event in durable inbox; reject unverified source. Verify actual provider signature semantics before enabling.
4. Worker fetches canonical Kiot row, normalizes and upserts source-owned fields without clobbering Whose-owned fields.
5. Incremental reconciliation compares entity count, IDs, branch stock and version hashes; full scans scheduled as needed.

## Outbound flow

- Separate append-only intent from dispatch. Only approved intent type enters durable outbox.
- States: pending_approval -> ready -> leased -> sent -> verified; retryable_failure or needs_review; never blindly replay a timeout if remote commit may have succeeded.
- Idempotency: unique (retailer, domain, operation_id), optional external document code and provider lookup before retry; immutable payload fingerprint; conflict => needs_review.
- Worker secret restricted to server; per-capability kill switches; rate-limit and backoff; one writer per object/branch where ordering matters.
- After send: re-fetch Kiot record and compare expected version/quantities/status. Every operation records before/after and actor.
- Stock mutations ALWAYS require independent test cases for concurrent sales, returns, reservations and partial deliveries; never convert a snapshot difference into a compensating Kiot write automatically.

## Persistence required

Separate private/public-safe tables as appropriate:
- connector_accounts (retailer IDs, feature toggles; **never plaintext credentials**)
- connector_capabilities (read/write verified, last test, provider response)
- connector_mappings (source ID, SKU, branch ID, Whose IDs; unique constraints)
- connector_sync_cursors (per type/branch, checkpoint and watermark)
- connector_inbox (event ID/type, digest, received/processed times, status)
- connector_outbox (intent key, actor, approval, expected version, payload digest, state, retries/lease)
- connector_attempts (request ID, safe status/error code and response digest, not tokens)
- connector_conflicts (source/target snapshots or sanitized digests, resolution)
- connector_reconciliation_runs and connector_reconciliation_diffs

Enable RLS, restrict admin/service writes, and avoid exposing authorization-definer RPCs to anon roles. Add retention by table after audit requirements are known.

## Operations dashboard

Read vs write gates and auth health; endpoint matrix; last successful inbound/outbound per entity; pending, dead letter and conflict counts; lag percentile; product count parity; inventory mismatch by branch/SKU; audit timeline; pause/resume and safe dry-run with no remote write.

## Release gates

G0: verify 10 existing read APIs and credentials; exact error codes and pagination.
G1: product import persisted, counts/images matched, feature branch merged safely.
G2: tables, signed inbox, canonical read-through, replay/duplicate tests, cursor recovery.
G3: outbox, approval, default-deny capability registry, dry-run and transport tests.
G4: one low-risk reversible write capability in sandbox or specifically approved retailer; prove readback, retry and conflict.
G5: progressively enable scoped writes by domain/branch; operator approval and rollback/compensation guidance.
G6: production readiness: alerting, full reconciliation, disaster recovery, 7-day monitored run without unexplained divergence.

**Do not mark two-way sync complete** unless G0-G6 pass with real provider evidence.
