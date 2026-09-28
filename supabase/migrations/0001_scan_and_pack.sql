-- Scan & Pack module — schema
--
-- Design notes (documented decisions, since several business rules aren't
-- fully covered by the existing schema):
--
-- 1. `products.sku` is new — only `product_variants.sku` existed before, and
--    only for variant-based products. A plain (no-variant) product needs its
--    own SKU too, since it's still a single packable unit.
-- 2. SKU uniqueness is enforced with a *partial* unique index (`where sku is
--    not null`) rather than `unique not null`, because every existing row
--    has `sku = null` today — a hard NOT NULL would break the current
--    dataset. Backfilling/assigning SKUs is a guided admin workflow (see
--    api/skus/*.ts and src/pages/SkuReview.tsx), not a migration concern.
-- 3. `orders` has no `updated_at` column, so "has this order changed since
--    the packing session started" is detected by snapshotting the order's
--    `items` + `status` at session start and diffing against the live row
--    at completion time, rather than a timestamp comparison.
-- 4. There is no existing "packed" state in `orders.status` or
--    `orders.shipping_status` — both are established state machines used
--    elsewhere (Sales Reports, shipping sync, badges). Rather than overload
--    either one, packing progress lives entirely in its own
--    `packing_status` column, left untouched by every other feature.
-- 5. This catalog's "combo" feature (see combo_settings /
--    products.is_combo_eligible) is a checkout-time discount across
--    separately-added products — there is no fixed-SKU preassembled combo
--    or bundle-of-components product today. `bundle_components` is added
--    for forward-compatibility (see PROJECT_CONTEXT / staff guide) but is
--    expected to be empty until such a product is introduced.

-- === 1. SKUs =================================================================

alter table products
  add column if not exists sku text,
  add column if not exists is_bundle boolean not null default false;

-- product_variants.sku already exists (added in an earlier session), nullable.

create unique index if not exists products_sku_unique_idx
  on products (sku) where sku is not null;

create unique index if not exists product_variants_sku_unique_idx
  on product_variants (sku) where sku is not null;

-- Audit trail for SKU assignment/changes — "prevent silent SKU changes that
-- could invalidate printed labels" is enforced at the API layer (changing an
-- already-assigned SKU requires an explicit confirm flag), and every
-- assignment/change is logged here regardless.
create table if not exists sku_change_log (
  id bigserial primary key,
  entity_type text not null check (entity_type in ('product', 'variant')),
  entity_id text not null,
  old_sku text,
  new_sku text,
  changed_by text not null,
  changed_at timestamptz not null default now(),
  reason text
);

create index if not exists sku_change_log_entity_idx
  on sku_change_log (entity_type, entity_id, changed_at desc);

-- Sealed/preassembled combo -> component SKUs, for the (currently unused)
-- bundle-of-components case. A bundle_sku with zero rows here is *not* the
-- same as "not a bundle" — see products.is_bundle, which is the actual flag
-- checked before packing.
create table if not exists bundle_components (
  id bigserial primary key,
  bundle_sku text not null,
  component_sku text not null,
  component_qty integer not null check (component_qty > 0),
  unique (bundle_sku, component_sku)
);

create index if not exists bundle_components_bundle_sku_idx
  on bundle_components (bundle_sku);

-- === 2. Packing progress on the order itself ================================

alter table orders
  add column if not exists packing_status text not null default 'not_started'
    check (packing_status in ('not_started', 'in_progress', 'packed')),
  add column if not exists packed_by text,
  add column if not exists packed_at timestamptz;

-- === 3. Packing sessions =====================================================

create table if not exists packing_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'reopened', 'abandoned')),
  -- Snapshots taken when the session starts, diffed against the live order
  -- at completion time (see note #3 above) — catches an order edited or
  -- cancelled mid-session.
  order_items_snapshot jsonb not null,
  order_status_snapshot text not null,
  started_by text not null,
  started_at timestamptz not null default now(),
  completed_by text,
  completed_at timestamptz,
  reopened_by text,
  reopened_at timestamptz,
  reopen_reason text,
  -- Optimistic lock for concurrent-scan safety (see api/_lib/packing.ts).
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists packing_sessions_order_id_idx
  on packing_sessions (order_id);

-- Only one *active* (not completed/abandoned) session per order — this is
-- the session lock: a second staff member opening Scan & Pack on the same
-- order resumes the same session rather than racing a second one.
create unique index if not exists packing_sessions_one_active_per_order
  on packing_sessions (order_id) where status in ('in_progress', 'reopened');

create table if not exists packing_session_items (
  id bigserial primary key,
  session_id uuid not null references packing_sessions(id) on delete cascade,
  -- Deterministic per-line key (see resolveOrderPackingItems in
  -- api/_lib/packing.ts) — handles duplicate order lines for the same SKU
  -- without double-counting, and survives resolving a bundle into multiple
  -- component rows.
  order_item_key text not null,
  sku text not null,
  product_id text,
  variant_id bigint,
  label text not null,
  weight text,
  parent_bundle_sku text,
  required_qty integer not null check (required_qty > 0),
  packed_qty integer not null default 0 check (packed_qty >= 0 and packed_qty <= required_qty),
  updated_at timestamptz not null default now(),
  unique (session_id, order_item_key)
);

create index if not exists packing_session_items_session_sku_idx
  on packing_session_items (session_id, sku);

create table if not exists packing_scan_events (
  id bigserial primary key,
  session_id uuid not null references packing_sessions(id) on delete cascade,
  session_item_id bigint references packing_session_items(id),
  raw_input text not null,
  resolved_sku text,
  outcome text not null check (outcome in (
    'pending',
    'accepted',
    'rejected_unknown_sku',
    'rejected_not_ordered',
    'rejected_wrong_variant',
    'rejected_overpack',
    'rejected_ineligible_order',
    'rejected_bundle_unconfigured'
  )),
  message text,
  scanned_by text not null,
  scanned_at timestamptz not null default now(),
  -- Client-generated idempotency key (one per physical scan attempt) —
  -- retried API calls for the *same* scan attempt never increment twice
  -- (see api/orders/packing/scan.ts: this row is inserted, claiming the key,
  -- *before* any packed_qty increment happens).
  idempotency_key text not null,
  -- "Undo last accepted scan" flips this rather than appending a new event,
  -- so "the last accepted, not-yet-undone scan" is a simple, indexable
  -- query instead of scanning the whole event log for pairs.
  undone boolean not null default false,
  undone_by text,
  undone_at timestamptz,
  undo_reason text,
  unique (session_id, idempotency_key)
);

create index if not exists packing_scan_events_session_idx
  on packing_scan_events (session_id, scanned_at desc);

-- === 4. Atomic increment/decrement =========================================
--
-- The only two operations that need real DB-level atomicity (a bare
-- supabase-js `.update()` can't express "increment, but only if still under
-- the limit" — PostgREST update payloads are literal values, not SQL
-- expressions over the current row). Everything else (SKU resolution, scan
-- validation, session state transitions) is plain application logic in
-- api/_lib/packing.ts, kept there specifically so it's unit-testable without
-- a database.
--
-- Concurrent scans: two simultaneous calls to packing_increment_item for the
-- same item both run their `update ... where packed_qty < required_qty`
-- under Postgres's normal row-level locking — the second one to actually
-- execute sees the first's committed result and its WHERE clause fails
-- (0 rows) once the limit is reached, so packed_qty can never exceed
-- required_qty no matter how the two requests are interleaved.

create or replace function packing_increment_item(p_item_id bigint)
returns setof packing_session_items
language sql
as $$
  update packing_session_items
  set packed_qty = packed_qty + 1, updated_at = now()
  where id = p_item_id and packed_qty < required_qty
  returning *;
$$;

create or replace function packing_decrement_item(p_item_id bigint)
returns setof packing_session_items
language sql
as $$
  update packing_session_items
  set packed_qty = packed_qty - 1, updated_at = now()
  where id = p_item_id and packed_qty > 0
  returning *;
$$;

-- === 5. Completion and reopen — the two operations where "revalidate and
-- persist in one safe transaction" actually matters (they're each a single
-- function call, so Postgres runs the whole body as one transaction; a
-- concurrent duplicate call blocks on the `for update` row lock below and
-- then sees the already-updated state, making both naturally idempotent). ===

create or replace function packing_complete_session(p_session_id uuid, p_completed_by text)
returns table (ok boolean, message text, session_status text)
language plpgsql
as $$
declare
  v_session packing_sessions%rowtype;
  v_incomplete_count integer;
begin
  select * into v_session from packing_sessions where id = p_session_id for update;

  if not found then
    return query select false, 'Packing session not found.', null::text;
    return;
  end if;

  if v_session.status = 'completed' then
    return query select true, 'Already completed.', v_session.status;
    return;
  end if;

  if v_session.status not in ('in_progress', 'reopened') then
    return query select false, 'This session is not active.', v_session.status;
    return;
  end if;

  select count(*) into v_incomplete_count
  from packing_session_items
  where session_id = p_session_id and packed_qty <> required_qty;

  if v_incomplete_count > 0 then
    return query select false, 'Not every item is fully packed yet.', v_session.status;
    return;
  end if;

  update packing_sessions
  set status = 'completed', completed_by = p_completed_by, completed_at = now(), updated_at = now()
  where id = p_session_id;

  update orders
  set packing_status = 'packed', packed_by = p_completed_by, packed_at = now()
  where id = v_session.order_id;

  return query select true, 'Packing completed.', 'completed'::text;
end;
$$;

create or replace function packing_reopen_session(p_session_id uuid, p_reopened_by text, p_reason text)
returns table (ok boolean, message text)
language plpgsql
as $$
declare
  v_session packing_sessions%rowtype;
begin
  select * into v_session from packing_sessions where id = p_session_id for update;

  if not found then
    return query select false, 'Packing session not found.';
    return;
  end if;

  if v_session.status <> 'completed' then
    return query select false, 'Only a completed session can be reopened.';
    return;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    return query select false, 'A reason is required to reopen packing.';
    return;
  end if;

  update packing_sessions
  set status = 'reopened', reopened_by = p_reopened_by, reopened_at = now(),
      reopen_reason = p_reason, updated_at = now()
  where id = p_session_id;

  update orders
  set packing_status = 'in_progress'
  where id = v_session.order_id;

  return query select true, 'Session reopened.';
end;
$$;
