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
│   ├── components/         # Reusable UI components (Header, Layout, Sidebar)
│   ├── pages/              # Main view components (Dashboard, Products)
│   ├── store/              # Zustand state stores (productStore.ts)
│   ├── types/              # TypeScript interfaces and types (product.ts)
│   ├── utils/              # Helper utilities (supabase.ts)
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
  `image`, `images`, `category`, `origin`, `weight`, `benefits`, `created_at`
- `isVisible`: whether the product shows on the storefront at all
- `available_quantity`, `reserved_quantity`, `low_stock_threshold`: from the FK'd
  `product_inventory` table — this, not `available`, is what actually drives customer-facing
  availability/stock messaging on the storefront
- `hsn_code`: required for compliant GST invoice line items
- `launch_status` (`available` / `just_launched` / `launching_soon`), `launch_date`,
  `launch_badge_text`: marketing fields for the storefront's launch features
- `available`: a legacy CMS-only field, kept for backwards compatibility but no longer used to
  drive the stock badge (see `available_quantity` instead)

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
3. **Product Inventory:** A comprehensive table view of all products with image previews, real stock levels, and visibility status.
4. **Product CRUD:** Full capability to add, edit, and delete products — including stock, GST HSN codes, and launch marketing fields — with drag-and-drop image uploads to Supabase Storage.
5. **Order Management:** View all customer orders, see detailed item breakdowns, invoice/refund status, and update fulfillment status.
6. **Coupons:** Create, edit, and deactivate `discount_coupons` used at storefront checkout.
7. **Launch Interest Leads:** View "Launching Soon" waitlist signups and track follow-up emails.
8. **Customers:** Aggregated customer list (name, email, phone, order count, total spent) derived from order history.
9. **Cancel Order + Refund:** Cancel an order, auto-cancel its Shiprocket shipment, and issue a full or partial Razorpay refund, all in one action with a required reason — see `api/orders/cancel.ts`.
10. **Update Shipping Details:** Manually attach/fix a Shiprocket Order ID, Shipment ID, and/or AWB Code on an order when automatic sync failed — an AWB Code auto-fetches courier name, status, and tracking link — see `api/orders/sync-shipping.ts`.

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

## Development Workflow
- Run development server: `npm run dev`
- Build for production: `npm run build`
- Linting: `npm run lint`
