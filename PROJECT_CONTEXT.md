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
10. **Update Shipping Details:** Manually attach/fix a Shiprocket Order ID, Shipment ID, and/or AWB Code on an order when automatic sync failed — an AWB Code auto-fetches courier name, status, and tracking link — see `api/orders/sync-shipping.ts`.
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
numbers on the actual tax invoices the storefront generates for the same orders. HSN codes come
from `useProductStore`'s already-loaded `products` list (each item's `id` is looked up against
`product.hsn_code`), so `SalesReports.tsx` lazily fetches products if that store is still empty,
the same pattern `Header.tsx` uses for its global search. Provides, per the selected date range:
total taxable value (turnover), CGST/SGST/IGST/total tax, an HSN-wise summary table (shipping/
convenience/COD fees are grouped under a synthetic "Charges" HSN row, matching the invoice
generator's treatment of them as incidental charges under Sec. 15(2)(c)), and a state-wise
(place-of-supply) breakdown — all surfaced in the page UI, the CSV (extra per-order columns:
HSN codes, taxable value, CGST/SGST/IGST, place of supply, supply type), and the PDF. Also added
"This Financial Year"/"Last Financial Year" (April–March) date presets alongside the calendar-
based ones, since that's the range a CA actually asks for at filing time, not "This Year".
Like the rest of this report, cancelled orders are excluded from turnover/tax figures.

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
