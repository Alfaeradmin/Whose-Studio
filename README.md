# Whose Studio

Isolated, read-only KiotViet audit console.

## Isolation guarantees
- No ALFAER WMS code or database dependency.
- No Pancake credentials.
- KiotViet write endpoints are not implemented.
- API handlers reject non-GET requests.
- KiotViet resources are allowlisted in `lib/kiotviet.js`.
- Repository contains no production credentials; secrets live only in Vercel Environment Variables.

## Required Vercel environment variables
- `KIOTVIET_CLIENT_ID`
- `KIOTVIET_CLIENT_SECRET`
- `KIOTVIET_RETAILER`

## Initial routes
- `/` dashboard
- `/api/health` credential/connectivity probe
- `/api/overview` branches/settings/products/orders/invoices/purchase orders overview

Do not commit `.env` files or credentials.
