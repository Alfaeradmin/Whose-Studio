# Whose Studio — logic gọi hàng từ ALFAER WMS (19/10/2026)

Code studied on ALFAER-WMS main:
- StoreRequestCreateV3Bridge.jsx: purpose Trial / Display / Exchange, search SPU, scan SKU and stock limit.
- StoreRequestsWorkspacePage.jsx: strict store/warehouse roles, batches, assignments, per-branch cache.
- StoreRequestWorkerQuickPage.jsx: batch claiming, location then SKU scan, shortage reason, person-to-person handoff.
- StoreRequestDetailFlow.jsx: picked != physically handed over; requested return != inventory returned.
- store-request-realtime-ux-baseline-20261002.md: immediate committed response, targeted entity refresh.

Selected adaptation to Whose:
1. LVS and NVT independent branches, each with Store and Warehouse teams; calls never create Kiot branch transfers.
2. Distinct colors and labels for Trial, Display, Exchange, Restock. P3 stores labels in purpose text only, not a trusted DB purpose_type. Never treat labels as sales evidence.
3. Urgent first, then FIFO. Queue ordering is only a view until concurrency-safe wave assignment exists.
4. Mobile one active pane: Inbox -> Conversation -> SKU detail. No nested scroll panels on one screen.
5. Permission presentation derives from branch membership; SQL whose_private.branch_role is the enforcement source.
6. Soạn != bàn giao != nhận; yêu cầu trả != đã trả. Neither step writes KiotViet stock.
7. Retry operation with same token, clear sensitive state on logout and branch change.

Release blockers:
- Runner custody and physical location scan, 40–150 burst / 8-tote batches.
- Verify invoice/return ids and statuses; only line-level unique bill matching with cancelled invoice compensation.
- Separate staging migration for validated purpose_type and custody records; role/realtime E2E on real test accounts.
- P1/P2/P3 CI, mobile device tests, RLS/authorization and explicit release approval.
