# Whose Gọi hàng — diagnostic and preview optimization (19 Oct 2026)

Observed read-only database: one chat, one line, four history events; appropriate existing indexes by branch and chat. No evidence that row volume causes slow loads. No authenticated production latency sample is available, so there is no verified p95 or improvement percentage.

Before: Browser -> Vercel GET -> four parallel Supabase Auth/membership checks -> thread SELECT -> parallel lines/events SELECT. List fetch and detail fetch each repeated authentication. Previous list and detail were re-requested on returning to Calling.

Preview changes:
- Detail GET performs three independent RLS-backed SELECTs in the same wave after authentication. It does not return any data until branch membership and thread scope have been validated.
- Successful GET returns Server-Timing auth and read durations for browser DevTools Network inspection. It never includes bearer tokens, user IDs or business data in timing headers.
- Memory-only caches are scoped by logged-in user, branch and conversation; fresh for at most nine seconds if the updated_at version matches, then revalidated. All writes invalidate the impacted cache; switching branch or logout clears it.
- Reusing a recently loaded list avoids redundant network requests. Transient errors do not blank last verified rows. Stale results cannot override changed branch or user state.
- No production database migration, invoice or Kiot stock write.

Next verification gates: CI + preview build, then real authenticated Network/server timing samples, account membership E2E and concurrency before merging to main.