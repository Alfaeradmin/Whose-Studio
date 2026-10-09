-- WHOSE Studio only. Never run against ALFAER WMS.
-- Baseline schema. KiotViet remains read-only; no stock movements are generated here.
create schema if not exists whose_private;
revoke all on schema whose_private from public, anon;
grant usage on schema whose_private to authenticated;

create table public.whose_branches (
 id uuid primary key default gen_random_uuid(),
 kiot_branch_id bigint unique,
 code text unique,
 name text not null,
 kind text not null check (kind in ('store','warehouse')),
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.whose_staff_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.whose_staff_memberships (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.whose_staff_profiles(user_id) on delete cascade,
 branch_id uuid not null references public.whose_branches(id) on delete cascade,
 role text not null check (role in ('admin','manager','warehouse','store','viewer')),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique (user_id,branch_id)
);
create index whose_staff_memberships_user_active_idx on public.whose_staff_memberships(user_id,branch_id) where is_active;

create table public.whose_products (
 id uuid primary key default gen_random_uuid(),
 kiot_product_id bigint unique,
 sku text not null unique,
 name text not null,
 attributes jsonb not null default '{}'::jsonb,
 is_active boolean not null default true,
 synced_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.whose_inventory_snapshots (
 branch_id uuid not null references public.whose_branches(id),
 product_id uuid not null references public.whose_products(id),
 on_hand numeric(16,3) not null,
 reserved numeric(16,3) not null default 0,
 source text not null default 'kiotviet' check (source = 'kiotviet'),
 source_updated_at timestamptz,
 synced_at timestamptz not null default now(),
 primary key (branch_id,product_id)
);
create index whose_inventory_product_idx on public.whose_inventory_snapshots(product_id);

create table public.whose_requests (
 id uuid primary key default gen_random_uuid(),
 origin_branch_id uuid not null references public.whose_branches(id),
 destination_branch_id uuid not null references public.whose_branches(id),
 created_by uuid not null references auth.users(id),
 idempotency_key uuid,
 status text not null default 'submitted' check (status in ('submitted','assigned','accepted','picking','handed_over','completed','rejected','cancelled')),
 note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (origin_branch_id <> destination_branch_id)
);
create unique index whose_request_idempotency_idx on public.whose_requests(created_by,idempotency_key) where idempotency_key is not null;
create index whose_requests_origin_time_idx on public.whose_requests(origin_branch_id,created_at desc);
create index whose_requests_destination_time_idx on public.whose_requests(destination_branch_id,created_at desc);

create table public.whose_request_lines (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.whose_requests(id) on delete cascade,
 sku text not null,
 product_id uuid references public.whose_products(id),
 requested_qty numeric(14,3) not null check (requested_qty > 0 and requested_qty <= 1000000),
 note text
);
create index whose_request_lines_request_idx on public.whose_request_lines(request_id);
create table public.whose_request_events (
 id bigint generated always as identity primary key,
 request_id uuid not null references public.whose_requests(id) on delete cascade,
 actor_id uuid references auth.users(id),
 event_type text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index whose_request_events_request_idx on public.whose_request_events(request_id,created_at);
create table public.whose_request_messages (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.whose_requests(id) on delete cascade,
 author_id uuid not null references auth.users(id),
 body text not null check (char_length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index whose_request_messages_request_idx on public.whose_request_messages(request_id,created_at);

-- Stocktake is isolated from operational stock until the reconciliation workflow is approved.
create table public.whose_stocktakes (
 id uuid primary key default gen_random_uuid(),
 branch_id uuid not null references public.whose_branches(id),
 title text not null,
 status text not null default 'draft' check (status in ('draft','counting','review','closed','cancelled')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 closed_at timestamptz
);
create table public.whose_stocktake_scans (
 id bigint generated always as identity primary key,
 stocktake_id uuid not null references public.whose_stocktakes(id) on delete cascade,
 product_id uuid not null references public.whose_products(id),
 scanned_by uuid not null references auth.users(id),
 scanned_at timestamptz not null default now(),
 scan_token uuid not null,
 unique(stocktake_id,scan_token)
);
create index whose_stocktake_scans_session_idx on public.whose_stocktake_scans(stocktake_id,scanned_at);

-- Integration state is inaccessible through the public Data API.
create table whose_private.integration_runs (
 id uuid primary key default gen_random_uuid(),
 provider text not null check (provider = 'kiotviet'),
 resource text not null,
 status text not null check (status in ('started','completed','failed')),
 cursor_value text,
 rows_fetched integer not null default 0,
 error_code text,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
revoke all on all tables in schema whose_private from public,anon,authenticated;

-- SECURITY DEFINER helpers are only for querying membership, never for arbitrary writes.
create function whose_private.active_staff() returns boolean language sql stable security definer
set search_path = '' as $$
 select (select auth.uid()) is not null and exists(
  select 1 from public.whose_staff_memberships m
  join public.whose_staff_profiles p on p.user_id=m.user_id
  where m.user_id=(select auth.uid()) and m.is_active and p.is_active
 );
$$;
create function whose_private.branch_role(p_branch uuid,p_roles text[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists(
  select 1 from public.whose_staff_memberships m
  join public.whose_staff_profiles p on p.user_id=m.user_id
  where m.user_id=(select auth.uid()) and m.branch_id=p_branch
    and m.is_active and p.is_active and (p_roles is null or m.role=any(p_roles))
 );
$$;
revoke execute on all functions in schema whose_private from public,anon;
grant execute on function whose_private.active_staff() to authenticated;
grant execute on function whose_private.branch_role(uuid,text[]) to authenticated;

alter table public.whose_branches enable row level security;
alter table public.whose_staff_profiles enable row level security;
alter table public.whose_staff_memberships enable row level security;
alter table public.whose_products enable row level security;
alter table public.whose_inventory_snapshots enable row level security;
alter table public.whose_requests enable row level security;
alter table public.whose_request_lines enable row level security;
alter table public.whose_request_events enable row level security;
alter table public.whose_request_messages enable row level security;
alter table public.whose_stocktakes enable row level security;
alter table public.whose_stocktake_scans enable row level security;

create policy "branch member can see branch" on public.whose_branches
for select to authenticated using ((select whose_private.branch_role(id,null)));
create policy "staff can see own profile" on public.whose_staff_profiles
for select to authenticated using (user_id=(select auth.uid()));
create policy "staff can see own membership" on public.whose_staff_memberships
for select to authenticated using (user_id=(select auth.uid()));
create policy "staff can see products" on public.whose_products
for select to authenticated using ((select whose_private.active_staff()));
create policy "branch member can see stock mirror" on public.whose_inventory_snapshots
for select to authenticated using ((select whose_private.branch_role(branch_id,null)));
create policy "member can see request" on public.whose_requests
for select to authenticated using (
 (select whose_private.branch_role(origin_branch_id,null))
 or (select whose_private.branch_role(destination_branch_id,null))
);
create policy "member can see lines" on public.whose_request_lines
for select to authenticated using (exists(
 select 1 from public.whose_requests r where r.id=request_id
));
create policy "member can see events" on public.whose_request_events
for select to authenticated using (exists(
 select 1 from public.whose_requests r where r.id=request_id
));
create policy "member can see messages" on public.whose_request_messages
for select to authenticated using (exists(
 select 1 from public.whose_requests r where r.id=request_id
));
create policy "member can see stocktake" on public.whose_stocktakes
for select to authenticated using ((select whose_private.branch_role(branch_id,null)));
create policy "member can see stocktake scans" on public.whose_stocktake_scans
for select to authenticated using (exists(
 select 1 from public.whose_stocktakes t where t.id=stocktake_id
));

-- Normal users can read scoped data. No direct table writes are exposed.
revoke all on all tables in schema public from anon;
grant select on
 public.whose_branches, public.whose_staff_profiles, public.whose_staff_memberships,
 public.whose_products,public.whose_inventory_snapshots,public.whose_requests,
 public.whose_request_lines,public.whose_request_events,public.whose_request_messages,
 public.whose_stocktakes,public.whose_stocktake_scans to authenticated;
revoke insert,update,delete,truncate,references,trigger on
 public.whose_branches, public.whose_staff_profiles, public.whose_staff_memberships,
 public.whose_products,public.whose_inventory_snapshots,public.whose_requests,
 public.whose_request_lines,public.whose_request_events,public.whose_request_messages,
 public.whose_stocktakes,public.whose_stocktake_scans from authenticated;

-- Safe and harmless readiness check, independent of credentials for KiotViet.
create function public.whose_backend_health() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('app','whose-studio','schema','20261009-foundation','kiotvietWriteEnabled',false);
$$;
revoke execute on function public.whose_backend_health() from public,anon;
grant execute on function public.whose_backend_health() to authenticated;

-- Atomic request submission. Only this narrow function may insert operational requests.
create function public.whose_submit_request(
 p_origin uuid,
 p_destination uuid,
 p_lines jsonb,
 p_note text default null,
 p_idempotency uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 v_user uuid := (select auth.uid());
 v_request uuid;
 v_line jsonb;
 v_sku text;
 v_qty numeric;
begin
 if v_user is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_origin is null or p_destination is null or p_origin=p_destination then
  raise exception 'invalid branches' using errcode='22023';
 end if;
 if not whose_private.branch_role(p_origin,array['admin','manager','warehouse','store']) then
  raise exception 'not authorized for origin branch' using errcode='42501';
 end if;
 if not exists(select 1 from public.whose_branches where id=p_destination and is_active) then
  raise exception 'destination unavailable' using errcode='22023';
 end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then
  raise exception '1-100 lines required' using errcode='22023';
 end if;
 if char_length(coalesce(p_note,''))>2000 then raise exception 'note too long' using errcode='22023'; end if;
 insert into public.whose_requests(origin_branch_id,destination_branch_id,created_by,idempotency_key,note)
 values(p_origin,p_destination,v_user,p_idempotency,p_note)
 on conflict (created_by,idempotency_key) where idempotency_key is not null do nothing
 returning id into v_request;
 if v_request is null then
  select id into v_request from public.whose_requests
   where created_by=v_user and idempotency_key=p_idempotency;
  if v_request is null then raise exception 'idempotency resolution failed'; end if;
  return v_request;
 end if;
 for v_line in select value from jsonb_array_elements(p_lines)
 loop
  if jsonb_typeof(v_line)<>'object' then raise exception 'invalid line' using errcode='22023'; end if;
  v_sku := trim(v_line->>'sku');
  if v_sku is null or char_length(v_sku) not between 1 and 100 then
   raise exception 'invalid sku' using errcode='22023';
  end if;
  if jsonb_typeof(v_line->'qty') not in ('number','string') then
   raise exception 'invalid quantity' using errcode='22023';
  end if;
  v_qty := (v_line->>'qty')::numeric;
  if v_qty<=0 or v_qty>1000000 or scale(v_qty)>3 then
   raise exception 'invalid quantity' using errcode='22023';
  end if;
  insert into public.whose_request_lines(request_id,sku,product_id,requested_qty,note)
  values (
    v_request,v_sku,
    (select id from public.whose_products where sku=v_sku and is_active),
    v_qty,
    left(nullif(trim(v_line->>'note'),''),1000)
  );
 end loop;
 insert into public.whose_request_events(request_id,actor_id,event_type,details)
 values(v_request,v_user,'submitted',jsonb_build_object('line_count',jsonb_array_length(p_lines)));
 return v_request;
end;
$$;
revoke execute on function public.whose_submit_request(uuid,uuid,jsonb,text,uuid) from public,anon;
grant execute on function public.whose_submit_request(uuid,uuid,jsonb,text,uuid) to authenticated;
