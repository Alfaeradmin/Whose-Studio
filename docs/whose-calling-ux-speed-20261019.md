# Whose Studio — P3 speed and clarity improvements (2026-10-19)

Findings from source inspection, not measured production latency:
- Chat API staff auth had three sequential request waves (user; memberships/admin; branch list). Independent reads now start concurrently; server still verifies every response and all role constraints.
- Calling screen previously awaited remote chat refresh to show navigation. Now navigation is immediate and data fetch is background.
- Chat list poll previously re-fetched selected chat and up to 500 events even if the row was unchanged; now only when updated_at changes or explicit refresh.
- Browser ran KiotViet full product import on admin login; now manual sync only. This is NOT proof of live source synchronization; P2 freshness warnings remain. Reliable background worker must be built separately.
- On tablet widths 761–1250px the SKU controls were invisible; the explicit action drawer fixes reachability.
- New requests now accept the chosen reason category alone; notes are optional. Adding SKU still requires an explanation. Backend validates all writes.
- Auth session checks, branch membership/RLS, and idempotent writes remain enabled.

Release gate: passing CI and Vercel build is not proof of device performance or source KiotViet freshness. Need actual role/E2E testing before production.