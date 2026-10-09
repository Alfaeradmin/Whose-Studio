# Whose Studio

Whose Studio is an independent operations platform for Whose, deployed separately from ALFAER WMS.

## Current production foundation

- Vercel project: `whose-studio`
- GitHub: `Alfaeradmin/Whose-Studio`
- KiotViet integration remains **read-only**
- No ALFAER WMS database, credentials, or runtime dependency
- Operational shell includes:
  - Dashboard
  - Store ↔ Warehouse
  - Inventory
  - Transfers
  - Stocktake
  - Returns / exchange foundation
  - Products
  - Employees & roles foundation
  - KiotViet sync
  - Settings / readiness
- Read model supports:
  - branches
  - settings
  - products
  - productOnHands
  - orders
  - invoices
  - purchaseorders
  - ordersuppliers
  - transfers
  - returns
- Access token requests are cached/coalesced per runtime instance.

## Required KiotViet environment variables

- `KIOTVIET_CLIENT_ID`
- `KIOTVIET_CLIENT_SECRET`
- `KIOTVIET_RETAILER`

## Planned Supabase environment variables

Whose will use a **separate Supabase project**. Do not point these at ALFAER WMS.

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- server-only secret/service key only where explicitly required

## Security / isolation

- KiotViet write endpoints are not implemented.
- API handlers reject unsupported write methods.
- Secrets stay in Vercel Environment Variables.
- Supabase Auth/RLS/Realtime will be enabled only on Whose's separate project.
- Do not commit `.env` files or credentials.

## Routes

- `/` — operational shell
- `/api/health` — KiotViet connectivity
- `/api/overview` — KiotViet read-model snapshot
- `/api/system` — production capability/readiness status
