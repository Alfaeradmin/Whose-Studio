# Whose Studio — KiotViet bill ↔ store request by line (preview)

**Compared with ALFAER WMS main**: store request Pancake reconciliation migration (20260825021155) and auto-match fallback (20260912043500). Alfaer uses a unique custody source or queues an exception when multiple holders, insufficient quantity, unmapped variant or canceled source events. Whose adapts branch and physically received-request source rules. A bill can precede its request in time; that alone should not prevent later matching.

**Verified Whose state on 19 Oct 2026**:
- Public chat data has qty_received, qty_returned, no qty_sold or invoice match ledger.
- whose_connector.documents has **0 rows**; stock_events has **0**. Product webhook is product-only; there is no confirmed running, complete invoices ingestion.
- Therefore the PREVIEW release is a **read-only Kiot document lookup and deterministic suggestion**, NOT committed bill matching, automatic background sync or physical stock adjustment.
- Kiot Retail official API: GET /invoices/code/{code}; branchId, status, invoiceDetails[productId, productCode, quantity]. Use status=1 (completed); other status fails closed. Upstream SDK examples disagree on enum mappings; must validate production samples before enabling irreversible actions.

**Preview P4**:
- View bill-code lookup inside Whose call detail, auth-scoped by LVS/NVT.
- Verify live source bill before returning even limited invoice fields. No customer/payment data exposed.
- Compare invoice detail SKU and Kiot product id to Whose line; require unique active received custody and adequate remaining quantity; any multiple candidate, unknown variant, partial qty or canceled status yields review. Does not require bill timestamp after request; bill-before-request may be proposed later.
- No extra data writes to Kiot and no local claimed sold balance. Existing operation log stays separate from employee chat messages.
- Test cross-branch, ambiguous, duplicate bill lines, qty and permissions.

**Remaining for production auto-match**:
1. Verified Kiot invoice update/delete webhook + periodic incremental invoice backfill by branch (LastModifiedFrom, pagination, retries/dedupe, immutable revision source).
2. Source-document table + invoice-line revision key and transactional match ledger, unique Kiot invoice line allocations, matched quantity <= verified received-minus-returned-minus-already-sold.
3. Kiot invoice cancellation/return event reversals, exception queues and manager review.
4. Server-only reconciliation with provider-verified payload, row locks and idempotency; never grant direct client RPC to create authoritative matches.
5. Active staff memberships and end-to-end tests with LVS and NVT, duplicated SKUs, stock movements and confirmed invoice status semantics.

Preview functionality is explicitly advisory and read-only. Do not claim that a bill was matched to a request in the database.


**Recent bill discovery added**: explicit user button "Quét 8 bill Kiot gần đây" calls provider's latest 8 invoice list and independently re-fetches each bill by code. No polling on opening the chat (performance safety); results are filtered to the selected request in UI, with server-side branch authorization across all requests to identify multiple plausible custody sources. Multiple invoices competing for the same on-hand received quantity in a single scan are downgraded to review. This is a limited read-only scan; it does not replace full webhook ingestion, modifiedDate cursor or transactional match ledger.
