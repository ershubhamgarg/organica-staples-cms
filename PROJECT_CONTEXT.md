# ANNVRIKSH CMS - Project Context

## Project Overview
ANNVRIKSH CMS is a premium management dashboard for an ethically sourced, organic pantry staple store. It allows administrators to manage premium product inventory, track orders with provenance details, and monitor business analytics. The CMS is built to reflect the brand's "quiet luxury" aesthetic while integrating with the ANNVRIKSH customer platforms.

## Tech Stack
- **Frontend Framework:** React 19 (with Vite)
- **Language:** TypeScript
- **State Management:** Zustand
- **Backend/Database:** Supabase (PostgreSQL + Auth + Storage)
- **Icons:** Lucide React
- **Styling:** Custom CSS with CSS Variables (Modern/Glassmorphism UI)
- **Routing:** React Router 7

## Directory Structure
```text
organica-staples-cms/
├── src/
│   ├── assets/             # Static assets like images and SVGs
│   ├── components/         # Header, Layout, Sidebar, ImageUpload
│   │   └── ui/              # Shared design-system primitives: Button, IconButton,
│   │                        # Modal (portal-based), Card, PageHeader, EmptyState,
│   │                        # ErrorBanner, Spinner, ProductImage
│   ├── pages/              # Main view components (Dashboard, Products, Inventory)
│   ├── store/              # Zustand state stores (productStore.ts)
│   ├── types/              # TypeScript interfaces and types (product.ts)
│   ├── utils/              # Helper utilities (supabase.ts, productImage.ts, stockStatus.ts)
│   ├── App.tsx             # Main application entry point with routing
│   └── main.tsx            # React DOM mounting
├── .env                    # Environment variables (Supabase URL & Key)
└── package.json            # Project dependencies and scripts
```

## Core Concepts & Data Models

### Product Model (`src/types/product.ts`)
The `Product` interface defines the structure of a product. Its `products` and
`product_inventory` columns come straight from the storefront's schema, so the two apps stay
in sync — see `~/Desktop/organica-staples/supabase/migrations` for the authoritative source:
- `id`, `name`, `description`, `price` (₹), `wholesale_price` (₹, feeds order profit/loss),
  `images` (jsonb array of URLs), `category`, `origin`, `weight`, `benefits`, `created_at`
  — **there is no singular `image` column on `products`**; `images[0]` (via
  `src/utils/productImage.ts`'s `getProductThumbnail()`) is the only real thumbnail source,
  matching the storefront's own `lib/data.ts` convention. An earlier version of this CMS
  read/wrote a nonexistent `image` field, which silently broke every product create/update
  (PostgREST rejects unknown columns) and left images unrendered — fixed by removing the
  field from the `Product` type entirely.
- `isVisible`: whether the product shows on the storefront at all
- `available_quantity`, `reserved_quantity`, `low_stock_threshold`: from the FK'd
  `product_inventory` table — see `src/pages/Inventory.tsx` for the dedicated stock
  management screen, and `src/utils/stockStatus.ts` for the shared In Stock / Low Stock /
  Out of Stock logic (`qty <= 0` → Out of Stock, `qty <= low_stock_threshold` → Low Stock)
- `hsn_code`: required for compliant GST invoice line items
- `launch_status` (`available` / `just_launched` / `launching_soon`), `launch_date`,
  `launch_badge_text`: marketing fields for the storefront's launch features

### State Management (`src/store/productStore.ts`)
Uses Zustand to manage global product state and handle asynchronous Supabase calls:
- `fetchProducts()`: Loads all products (embedding `product_inventory`) ordered by date.
- `addProduct()` / `updateProduct()`: Insert/update `products` columns only.
- `updateInventory()`: Writes `available_quantity`/`low_stock_threshold` to the separate
  `product_inventory` table.
- `deleteProduct()`: Removes a product from the database.

Sibling stores follow the same pattern for other tables: `couponStore.ts` (`discount_coupons`,
keyed by `code`), `launchInterestStore.ts` (`product_launch_interests`), `customerStore.ts`
(aggregates customers client-side from `orders`).

## Key Features
1. **Admin Authentication:** Secure login system to protect sensitive store data. Only authenticated users can access the dashboard and management tools.
2. **Dashboard:** Provides a high-level overview of revenue, orders, and recent activity using real-time database counts.
3. **Product List:** A comprehensive table view of all products with image previews and visibility status.
3b. **Inventory:** A dedicated screen (`src/pages/Inventory.tsx`) for stock management — search, filter by In Stock/Low Stock/Out of Stock, and update available quantity + low-stock threshold per product without touching the rest of the product record.
4. **Product CRUD:** Full capability to add, edit, and delete products — including stock, GST HSN codes, and launch marketing fields — with drag-and-drop image uploads to Supabase Storage.
5. **Order Management:** View all customer orders, see detailed item breakdowns, invoice/refund status, and update fulfillment status.
6. **Coupons:** Create, edit, and deactivate `discount_coupons` used at storefront checkout.
7. **Launch Interest Leads:** View "Launching Soon" waitlist signups and track follow-up emails.
8. **Customers:** Aggregated customer list (name, email, phone, order count, total spent) derived from order history.
9. **Cancel Order + Refund:** Cancel an order, auto-cancel its Shiprocket shipment, and issue a full or partial Razorpay refund, all in one action with a required reason — see `api/orders/cancel.ts`.
10. **Update Shipping Details:** Manually attach/fix a Shiprocket Order ID, Shipment ID, and/or AWB Code on an order when automatic sync failed — an AWB Code auto-fetches courier name, status, and tracking link, and — once a courier is actually assigned — corrects the order's margin from Shiprocket's real freight charge. See below for details, and `api/orders/sync-shipping.ts`.
11. **Sales Reports:** `src/pages/SalesReports.tsx` — filter orders by preset range (Today/This Week/This Month/Last Month/This Year) or a custom date range, view a Daily/Weekly/Monthly revenue breakdown, top products, payment-method and order-status splits, and export the filtered orders as CSV or a formatted PDF report. See below for details.

## Environment Setup
Required variables in `.env` (client-side, Vite-exposed):
- `VITE_SUPABASE_URL`: Your Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous/public key.

### Server-only variables (Vercel project settings, never in `.env`/client code)
Required for `api/orders/cancel.ts` and `api/orders/sync-shipping.ts` (Vercel Edge Functions
under `api/`). Add these in the CMS's own Vercel project — copy the values from the
storefront's Vercel project, where they already exist:
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`: for issuing refunds.
- `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`: for cancelling/tracking shipments.
- `VITE_SUPABASE_SERVICE_ROLE_KEY`: already present in this project's Vercel env (pulled
  earlier) — the Edge Functions read it server-side only; it must never be referenced from
  `src/` since Vite would then bundle it into client-side JS.

## Security & RLS
This CMS uses the **Anon Key** and **Supabase Auth**. To allow admins to read orders and manage products, ensure the following SQL policies are applied in your Supabase Dashboard:

```sql
-- 1. Allow authenticated users (Admins) to read all orders
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" 
ON public.orders 
FOR SELECT 
TO authenticated 
USING (true);

-- 2. Allow authenticated users (Admins) to update order status
DROP POLICY IF EXISTS "Admins can update order status" ON public.orders;
CREATE POLICY "Admins can update order status" 
ON public.orders 
FOR UPDATE 
TO authenticated 
USING (true);

-- 3. Allow authenticated users (Admins) full access to products
DROP POLICY IF EXISTS "Admins have full access to products" ON public.products;
CREATE POLICY "Admins have full access to products" 
ON public.products 
FOR ALL 
TO authenticated 
USING (true);

-- 4. Allow admins to write stock levels from the CMS
-- (product_inventory only ships with a public read-only policy by default)
DROP POLICY IF EXISTS "Admins have full access to inventory" ON public.product_inventory;
CREATE POLICY "Admins have full access to inventory"
ON public.product_inventory FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Allow admins to manage coupons from the CMS
-- (discount_coupons was created directly in the Supabase dashboard with no
-- policies of its own, so RLS blocks the CMS's admin session without this)
ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins have full access to coupons" ON public.discount_coupons;
CREATE POLICY "Admins have full access to coupons"
ON public.discount_coupons FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
```

This block is idempotent (safe to re-run) — it drops each policy before recreating it, so it
won't error if some of these were already applied previously.

### New column for Cancel Order + Refund

`api/orders/cancel.ts` writes a cancellation reason to its own column, kept separate from the
existing `rejection_reason` (used by the pre-fulfillment "Reject Order" flow) so the two cases
stay distinguishable in the data:
```sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;
```

### Diagnosing an empty Products page

If `products` still returns no rows after applying the above, run this in the SQL editor (it
runs as the Postgres superuser, so it bypasses RLS and shows ground truth):

```sql
-- Row count and isVisible breakdown
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE "isVisible" = true) AS visible,
  count(*) FILTER (WHERE "isVisible" = false) AS hidden,
  count(*) FILTER (WHERE "isVisible" IS NULL) AS null_visibility
FROM public.products;

-- Every RLS policy currently active on products, including any added outside
-- the migrations/this file (e.g. a RESTRICTIVE policy would explain rows
-- being hidden from every role, admins included)
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'products';
```

`product_launch_interests` already has a permissive `for all using (true)` policy (see
storefront migration `20260603000000_product_launch_interests.sql`), so the CMS's Launch
Interests page works without any additional SQL.

### Missing Storage bucket for product image uploads

`src/store/productStore.ts`'s `uploadImage()` uploads to a Supabase Storage bucket named
`products`, but that bucket does not exist in this project — confirmed directly (both
`GET /storage/v1/bucket/products` and a direct upload probe return `NoSuchBucket`, and
`GET /storage/v1/bucket` lists no public buckets at all). This means image uploads through
the CMS's product form have never worked; whatever images the 22 existing products have
must have been seeded as external URLs directly into the `images` jsonb column, not
uploaded through this app. Run this once in the Supabase SQL editor to create it:

```sql
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

drop policy if exists "Public read access for product images" on storage.objects;
create policy "Public read access for product images"
on storage.objects for select
using (bucket_id = 'products');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'products');

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
on storage.objects for update
to authenticated
using (bucket_id = 'products');

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
on storage.objects for delete
to authenticated
using (bucket_id = 'products');
```

### Sales Reports (`src/pages/SalesReports.tsx`)

Purely client-side — reuses the same `orders` array already loaded into `useOrderStore` by
`Layout.tsx` on app mount (no new API endpoint or Supabase query). The actual date filtering,
aggregation (revenue/discount/profit/refunds/items-sold/weight/payment-method/status/top-products),
and day-or-week-or-month grouping logic lives in `src/utils/salesReport.ts`, kept separate from
the page component so it's independently reasoned about/testable. Cancelled orders are excluded
from every revenue/profit figure (matching `statsStore.ts`'s existing Dashboard convention) but
still counted/shown separately, since "how much did we sell" and "how many orders came in" are
different questions.

Two export formats:
- **CSV** (`ordersToCSV`/`downloadCSV` in `salesReport.ts`) — one row per order, generated
  synchronously client-side, no dependency. Prefixed with a UTF-8 BOM so Excel renders the ₹
  symbol and non-ASCII customer names correctly instead of mangling them.
- **PDF** (`src/utils/salesReportPdf.ts`) — deliberately scoped to **tax-relevant figures only**
  (order counts for context, the GST/Tax Summary, HSN-wise summary, state-wise/place-of-supply
  summary, and a per-order tax table: taxable value, CGST/SGST/IGST, invoice value, place of
  supply) since this PDF is meant to go straight to a CA for GST/ITR filing — no profit/loss,
  discount, payment-method, top-product, or period-trend figures, which stay in the on-screen
  report and the CSV instead. Built with `jspdf`/`jspdf-autotable`. This is a genuinely new,
  separate concern from the storefront-driven GST invoice PDFs documented below — those are
  per-order legal documents generated once at order creation and simply downloaded here; this is
  an ad-hoc, admin-only tax report generated on-demand for an arbitrary date range, which has no
  equivalent "already generated" artifact to fetch. **Lazy-loaded via dynamic `import()`** on the
  Export PDF click rather than a top-level import — jsPDF pulls in ~450KB (plus optional
  `html2canvas`/`dompurify` chunks for features this report doesn't use) that no other page in
  the app needs, so eagerly importing it inflated the main bundle for every route. Confirmed via
  a build-output comparison before/after. jsPDF's built-in fonts have no glyph for ₹ (renders as
  a missing-character box), so the PDF itself uses "Rs." instead — the CSV keeps the real ₹
  symbol since spreadsheets don't have that font limitation.

**GST/tax breakdown (`src/utils/gst.ts`)**: added so a CA has what's needed to file returns
directly from this report. Deliberately mirrors the storefront's `lib/invoice.tsx` GST math
line-for-line (`SELLER` constants including GSTIN, the `STATE_CODES` table, `isIntraState`,
and the GST-inclusive-price split `taxableValue = amount / 1.05`) rather than inventing a
second, potentially-diverging implementation — the numbers here must always reconcile with the
numbers on the actual tax invoices the storefront generates for the same orders. HSN codes are
read directly off each order's own stored `items[].hsn_code` (captured on the storefront's side
in `recomputeOrderPricing`, `app/api/orders/route.ts`, at order-placement time) rather than via a
live join back to the current `products` table. This was a deliberate fix, not the original
design: the first version built a `Map<string, hsn_code>` keyed by `product.id` fetched from
`useProductStore`, looked up via `hsnByProductId.get(String(item.id))` — but `products.id` is a
Postgres integer, which Supabase returns as a JS `number` (confirmed live: `{"id":9,...}`), so
the map's keys were numbers while the lookup used a string key, which **never matched** — every
item silently fell back to the "-" (unknown) bucket and nothing consolidated by its real HSN at
all. Reading `item.hsn_code` straight off the order sidesteps that class of bug entirely (no join,
no type coercion to get wrong) and is more correct besides — it reflects the HSN actually in
effect when the order was placed, not whatever the product's HSN has since been edited to.
Verified the fix with a standalone script (two orders, two different products sharing one HSN
code) confirming the summary now correctly consolidates to one row with quantities summed instead
of splitting. Provides, per the selected date range:
total taxable value (turnover), CGST/SGST/IGST/total tax, an HSN-wise summary table (shipping/
convenience/COD fees are grouped under a synthetic "Charges" HSN row, matching the invoice
generator's treatment of them as incidental charges under Sec. 15(2)(c)), and a state-wise
(place-of-supply) breakdown — all surfaced in the page UI, the CSV (extra per-order columns:
HSN codes, taxable value, CGST/SGST/IGST, place of supply, supply type), and the PDF. Also added
"This Financial Year"/"Last Financial Year" (April–March) date presets alongside the calendar-
based ones, since that's the range a CA actually asks for at filing time, not "This Year".
Like the rest of this report, cancelled orders are excluded from turnover/tax figures.

Each `HsnTaxLine` also carries `description` (the distinct product name(s) sold under that HSN,
joined with ", " — the "Charges" pseudo-row's description is a fixed
"Shipping / Convenience / COD Charges" label) and `quantity` (units sold), matching what a GSTR-1
HSN summary actually needs beyond just the monetary totals — both `computeOrderTax` and
`computeGstSummary` accumulate these the same way they accumulate the tax amounts (a `Set` per
HSN code across orders, joined into the final string once at the end, so the same product
appearing in multiple orders isn't repeated).

**Row ordering and the two synthetic rows**: the summary mixes real product HSN codes with two
non-product rows — `"Charges"` (shipping/convenience/COD) and `"-"` (a product with no HSN code
assigned). Sorting by tax amount, the original approach, made these interleave unpredictably with
real HSN rows depending on which happened to have the largest total on a given date range — a
large "-" bucket (e.g. from orders predating the storefront's HSN-attachment fix, or products that
just don't have an HSN set) could easily sort to the very top. `sortHsnLines()` now always orders
real HSN codes first (ascending, numeric-aware), then `"Charges"`, then `"-"` last, regardless of
amount — same fix applied identically in `computeOrderTax` (per-order) and `computeGstSummary`
(the aggregated table all three exports/the page read from), so PDF, Excel, and the on-screen
table all inherit it automatically. Also stopped joining every product name into the `"-"` row's
description (this row's name-set has no ceiling — it can span everything lacking an HSN code — and
an unbounded comma list isn't actually useful information); `describeHsnGroup()` gives it a fixed
explanatory label instead: "Products without an HSN code assigned — add one on the product to
classify this sale".

**Third export format — Excel** (`src/utils/salesReportExcel.ts`, `xlsx`/SheetJS): the same
tax-only content as the PDF (order counts, GST summary, HSN-wise detail, state-wise summary, and
the per-order tax table — now also with invoice number and customer name, since a spreadsheet
isn't page-width-constrained the way the PDF is), laid out as four sheets (Summary, HSN Summary,
State Summary, Order Tax Detail) so a CA can filter/pivot it directly rather than working from a
fixed PDF layout. Lazy-loaded on the Export Excel click, same reasoning and pattern as the PDF
import. **The `xlsx` package is installed from SheetJS's own CDN tarball
(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), not the npm registry** — the npm-published
`xlsx` is stuck on 0.18.5 with two unpatched high-severity advisories (prototype pollution, ReDoS)
that SheetJS fixed only in their own actively-maintained CDN builds after moving off npm. Both
vulnerable code paths are in *parsing* untrusted input (`XLSX.read`/`readFile`) — this app only
ever calls `XLSX.utils.*`/`writeFile` to generate a workbook from its own trusted order data, so
the exploitable path was never reachable either way, but there was no reason to ship a
known-vulnerable dependency when the vendor's own patched build is a drop-in replacement (same
package name and API in `package.json`, just a different install source).

### Margin correction on actual AWB assignment (`api/orders/sync-shipping.ts`)

`cost_to_company`/`profit_loss` are computed exactly once, inside the Postgres RPC
`place_order_with_inventory` (storefront repo, `supabase/migrations/20260910010000_variant_aware_place_order.sql`),
at order-creation time:

```
cost_to_company = wholesale_total_amount + extra_shipping_amount + 20 (packing) + 0.02 × total_amount (gateway)
profit_loss     = total_amount - cost_to_company
```

`extra_shipping_amount` (the shipping cost the business absorbs, i.e. freight not recovered from
the customer) is derived at checkout from a **pre-purchase Shiprocket rate/serviceability check**
(`/courier/serviceability/`, called before any real shipment exists) — necessarily an estimate,
using a locally-guessed package weight rather than whatever Shiprocket ends up actually charging
once a courier is picked and the shipment is weighed. Traced every consumer of `extra_shipping_amount`/
`cost_to_company`/`profit_loss` and confirmed nothing else in either repo ever recomputes them —
they sit at whatever the estimate produced, forever, unless something corrects them.

This CMS is that correction. `sync-shipping.ts` already fetches Shiprocket tracking data whenever
an AWB is known (either freshly typed into "Update Shipping Details", or already stored, checked
automatically whenever the Order Details page loads — see `OrderDetails.tsx`). The same request now
also — whenever both a `shiprocket_order_id` and an AWB are known — calls Shiprocket's
`GET /orders/show/{shiprocket_order_id}` (a call neither repo made before this) to read the real
`freight_charges`, and applies it as a **delta**, not a recompute-from-scratch: since
`shipping_amount` (what the customer paid) is fixed and immutable, and in every branch of the
checkout's discount/free-shipping/capping logic `shipping_amount + extra_shipping_amount` always
equals the estimated total freight, the same identity holds for the actual figure:
`actual_extra_shipping = max(0, actual_freight_charge − shipping_amount)`. The stored
`extra_shipping_amount`, `cost_to_company` (+= delta), `profit_loss` (−= delta), and `freight_charge`
(overwritten with the now-known actual value — it existed as a column already, populated with the
estimate at creation, but excluded from the CTC formula since `20260527000002_fix_shipping_ctc_final.sql`)
are all updated together, only when the delta is ≥ ₹0.01 (skips a no-op write when the estimate
already matched). The "Update Shipping Details" modal shows a toast either way — informing the
admin the margin changed and by how much, or that Shiprocket confirmed the estimate — so a
suddenly-different profit figure doesn't look unexplained; the automatic on-page-load sync applies
the same correction silently, matching how it already handles tracking updates there.

**Response shape — verified against 4 real live orders, not guessed**: `GET /orders/show/{id}` is
a call neither repo made before this, and Shiprocket's public docs suggest the freight charge
would live at `data.shipments[].freight_charges` or `data.freight_charges` — **both wrong**. The
real, undocumented location is `data.awb_data.charges.freight_charges` (confirmed by fetching this
endpoint directly against 4 production orders with the real `SHIPROCKET_EMAIL`/`SHIPROCKET_PASSWORD`
from `.env.local`, a safe read-only call). `data.shipments` does exist, but as a single object
(not an array) carrying shipment status/courier/AWB info, not charges — following the docs' guess
would have silently read `undefined` forever, in this case failing closed correctly. Also observed
live and specifically guarded against: `freight_charges` can be the **empty string `""`**
(Shiprocket hasn't finalized it yet, e.g. pickup not yet scheduled) rather than simply absent —
`Number("")` evaluates to `0` in JS, which the first version of this code would have silently read
as "Shiprocket charged nothing" and wiped out a real, substantial cost. Caught this before shipping
by testing against orders in that exact state; empty/whitespace-only strings are now treated the
same as "not present yet" (correction skipped, not zeroed). One order tested had a real, differing
actual charge — estimate ₹475.35 vs. actual ₹182.46 — confirming both that the delta math is
directionally correct (this order's margin improves once corrected, since the estimate overstated
the shipping loss) and that real-world estimate/actual gaps here are large enough to matter.

**Hiding the estimate instead of showing it as final** — `OrderDetails.tsx`'s "Profit Analysis"
card and `Orders.tsx`'s per-row Profit/Loss column both gate on
`awbPending = !order.shiprocket_awb_code && order.status !== "cancelled"`. While pending, the
numbers are replaced with a warning (an amber `AlertTriangle`, explanatory copy, and — on the
Order Details page — an "Assign AWB" button that opens the same "Update Shipping Details" modal
`handleOpenShippingModal` already opens) rather than computed from `profit_loss`/`cost_to_company`
at all, since those are the pre-correction estimate until an AWB exists and can be off by 2-3x (see
above). Cancelled orders are exempt from the gate — they'll never get an AWB, so gating them would
be a permanent, unfixable warning rather than a prompt toward a real fix, and they're already
excluded from profit reporting elsewhere (Dashboard, Sales Reports). Once `sync-shipping.ts`'s
correction lands (AWB assigned, actual freight fetched), both surfaces automatically flip back to
showing the real figures — no separate "is this corrected yet" flag needed, `shiprocket_awb_code`
being set is itself the signal.

**Local (hand-delivered) orders — `src/utils/localOrder.ts`**: the same `awbPending` gate above
initially treated *every* order without an AWB as "estimate pending", which is wrong for orders
that will never get one by design. The storefront already has a full local-delivery concept —
orders to a single configured pincode (`125055` by default, `NEXT_PUBLIC_LOCAL_DELIVERY_PINCODE`
in that repo) skip Shiprocket entirely (`lib/shipping.ts`/`lib/shiprocket.ts`'s
`isLocalDeliveryPincode`/local-delivery short-circuit) — the CMS just had no awareness of it.
`isLocalOrder()` mirrors that pincode check (kept in sync via this repo's own
`VITE_LOCAL_DELIVERY_PINCODE`, same default), **and** independently checks
`shipping_status === "local_delivery"`, since the storefront only ever writes that value when its
own `NEXT_PUBLIC_ENABLE_SHIPROCKET_SHIPMENT` flag is on — with it off, a local order's
`shipping_status` looks identical to any other pending order's, so the pincode is the more robust
signal and either one is treated as sufficient. Verified against a real production order
(`7f81559f…`, zip `125055`, `shipping_status: "local_delivery"`, no AWB): its `cost_to_company`/
`profit_loss` are already correctly computed with a zero shipping component (`extra_shipping_amount: 0`
— nothing to estimate, there's no courier) — a **final** ₹69.36 profit that the `awbPending` gate
was, before this fix, incorrectly hiding behind a permanent "assign an AWB" prompt.

Where this is used: `OrderDetails.tsx` — `awbPending` additionally requires `!isLocal`; the header
shows a "Local Delivery" badge (via `MapPin`) in place of the generic shipping-status badge; the
status `<select>` offers only Processing/Delivered/Cancelled (no Pending/Shipped — there's no
courier hand-off step to pass through), always including the order's current status as a
fallback option even if it falls outside that set so the dropdown never renders blank; and the
"Shipping & Logistics" card replaces the courier/AWB/tracking UI and its "Update" button (nothing
to sync) with a plain explanatory note. `Orders.tsx` applies the same `!isLocalOrder(order)`
condition to its Profit/Loss column's gate, and adds a small "Local" badge next to the status
badge in the list so these orders are identifiable without opening each one.

### Invoice download (`api/orders/invoice.ts`)

GST invoices are **not** generated by this CMS. The storefront
(`organica-staples`'s `ensureInvoiceGenerated` in `lib/invoiceGeneration.ts`) renders the PDF
once at order-confirmation time, uploads it to a private Supabase Storage bucket named
`invoices` at path `${order.id}.pdf`, and stamps `orders.invoice_number` /
`invoice_generated_at` / `invoice_pdf_path`. This CMS's `api/orders/invoice.ts` (Edge runtime)
only ever fetches that already-stored file via the service-role client and streams it back —
it has no PDF-rendering dependency at all. `invoice_pdf_path` was confirmed to already exist as
a column on `orders` in production (`GET /orders?select=id,invoice_pdf_path` returns `[]`, not
a column error). The `invoices` bucket's existence could **not** be conclusively confirmed via
the anon key — Supabase returns the same generic `NoSuchBucket` error for "doesn't exist" and
"exists but private/unauthorized" — but the endpoint uses service-role access, which bypasses
Storage RLS entirely, so it works transparently if the bucket exists and fails with a clear
500 if it doesn't. Run this once in the Supabase SQL editor if invoice downloads 500 with a
missing-bucket error (matches the storefront's own migration, `is safe to run even if it
already exists`):

```sql
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;
```

The Order Details page only shows the "Download" button when `order.invoice_pdf_path` is set
(older orders placed before this feature existed have no stored PDF and show "Not yet
generated" instead, matching the storefront's own display logic).

### Product variants (`product_variants` / `product_variant_inventory`)

Products can optionally have size/weight variants (e.g. 5 Kg vs 10 Kg bags), each with its own
price, wholesale cost, and stock — schema owned by the storefront repo's migration
`supabase/migrations/20260910000000_product_variants.sql` (`product_variants`, keyed to
`products.id`, plus a separate `product_variant_inventory` table for per-variant stock, mirroring
how the base product's own stock lives in `product_inventory` rather than on `products` itself).
Products with zero variants are completely unaffected and keep using the base product's own
`price`/`available_quantity`/`low_stock_threshold` fields directly.

Each variant can also carry its own **discount percentage** (`discount_percent`, 0-100, applied to
that variant's `price` to get what the customer actually pays) — added here, and not yet present
in the storefront repo's migration, since it's currently an admin-side pricing tool. Confirmed via
a live query that `product_variants` does **not** yet have this column
(`GET /product_variants?select=*` returns rows with no `discount_percent` key). Run this once in
the Supabase SQL editor before using the Discount (%) field in the product form — the CMS silently
writes `0` for every variant until this column exists, since Supabase/PostgREST rejects an
insert/update referencing an unknown column outright rather than ignoring it:

```sql
alter table public.product_variants
  add column if not exists discount_percent numeric not null default 0
  check (discount_percent >= 0 and discount_percent <= 100);
```

If the storefront's own checkout/product pages should also honor this discount (rather than it
being purely an internal CMS pricing note for now), the same column needs adding to that repo's
migrations too, and its variant-selection UI updated to price against
`price * (1 - discount_percent / 100)` — out of scope here since this task only covers the CMS
side.

## Development Workflow
- Run development server: `npm run dev`
- Build for production: `npm run build`
- Linting: `npm run lint`
