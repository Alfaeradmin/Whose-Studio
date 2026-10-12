# WHOSE STUDIO — Operating System Architecture v1
Status: proposal; reference derived from read-only review of ALFAER-WMS main (2026-10-12). No cross-project synchronization, code copying or shared data.
## Product principles
1. Whose retains its own branding, user roles, branch model, KiotViet contracts, data ownership and lifecycle. ALFAER is a reference for engineering/interaction patterns, not the business model.
2. One semantic UI/token/component contract across screens; one scan/search interaction pattern; one scoped work context; modules loaded on demand.
3. Every business action reports acknowledged state only. Audit actor, branch, source, attempt, result, and idempotency key. No fake loading/progress.
4. Keep frontend lean and progressively modularize; don't perform big-bang React rewrite while inventory/auth are being stabilized.
## Current code assessment
- ALFAER: React 18 + Vite, React Router, lazy-loaded features, work context, camera barcode bridge (ZXing + native formats), reusable transaction UX, guarded concurrency and retry-safe reads.
- Whose: Vanilla HTML/CSS/JS with app.js orchestrating multiple modules, versioned UI tokens, dedicated product-sync, auth REST, inventory snapshot infrastructure (branch-product), isolated webhook queue.
## Target modules
- Shell: navigation, work context, permissions, responsive panels, modal/scroll stack, notifications and action feedback.
- Product catalog: images, search, SKU/barcode lookup, supplier/category as available; source provenance.
- Inventory: branch-scoped, onHand / reserved / available / timestamp; import checkpoint, stale-data label, reconciliation and read-only operation mode.
- Orders: status, actionable tasks, bill detail and human verification.
- Warehouse execution: scan-assisted receive/pick/putaway flows only when data model supports accurate location and ownership.
- Employees/access: scopes, roles, shift only if Whose business confirms shift semantics.
- Settings/health: admin-only integration diagnostics and operational audit.
## UX contracts
- Standard top action group, content width, heading, filters, fixed or sticky action footer, scrollable content pane.
- SearchScanner input: mode product|barcode|location; scan source keyboard|camera|manual; no overlap with controls; list suggestions with image, SKU and branch stock; Enter selects, Escape closes; mobile large targets; camera permission and fallback.
- Form fields: 44px min touch target, accessible labels, validated quantity before commit; one error message anchored at source input.
- Lists: shared loading/error/empty/retry states, filters and correct count; page cursor retained; no deceptive truncation.
- Transactions: prepare -> validate -> submit with idempotency -> server ack -> display authoritative state -> record audit; no optimistic stock changes.
- Auth: hydrate persisted session, refresh on expiry, don't clear on transient transport errors, logout explicit; no claim of authentication without server validation.
## Safe migration sequence
P0: complete inventory snapshot ingestion, validate page 11 and onwards, display real branch stock, verify counts vs KiotViet; keep source read-only.
P1: test session restoration on F5, clean single Whose design token theme, standardize forms/dialog/notifications.
P2: split app.js by module without reworking business logic; establish lazy entrypoint, contract tests, smoke tests and rollback.
P3: reusable SearchScanner with keyboard scanner first, then camera ZXing fallback; no location workflow before data model exists.
P4: scoped work context, role checks and targeted notification/action navigation.
P5: report/exceptions/ledger/history modules, real-time updates only with independent transaction provenance.
## Acceptance gates
- Validate actual Kiot inventory onHand and reserved for LVS and NVT; no silent zero, no unmapped product/branch writes; incomplete pages resumable, no cross-page duplicate keys.
- F5 retains valid session; expiration refresh works; invalid/explicit logout requires login.
- Mobile 360px and desktop >1280px work without clipped controls, overlapping text, off-screen modal or scroll trapping.
- CI tests + preview smoke and error-log inspection; no production merge until separately verified.
- No changes whatsoever to ALFAER WMS repo, Vercel or Supabase for this program.
