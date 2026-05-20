# Organica Staples CMS - Project Context

## Project Overview
Organica Staples CMS is a management dashboard for an organic food store. It allows administrators to manage product inventory, track orders, and view business analytics. The CMS is built to work seamlessly with the main Organica Staples customer-facing application, sharing the same Supabase backend.

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
The `Product` interface defines the structure of a product in the database:
- `id`: UUID (Primary Key)
- `name`: String
- `description`: Text
- `price`: Number (in ₹)
- `image`: String (URL)
- `category`: String
- `origin`: String
- `weight`: String (e.g., "500g")
- `available`: Boolean
- `created_at`: Timestamp

### State Management (`src/store/productStore.ts`)
Uses Zustand to manage global product state and handle asynchronous Supabase calls:
- `fetchProducts()`: Loads all products ordered by date.
- `addProduct()`: Inserts a new product record.
- `updateProduct()`: Updates existing product details.
- `deleteProduct()`: Removes a product from the database.

## Key Features
1. **Admin Authentication:** Secure login system to protect sensitive store data. Only authenticated users can access the dashboard and management tools.
2. **Dashboard:** Provides a high-level overview of revenue, orders, and recent activity using real-time database counts.
3. **Product Inventory:** A comprehensive table view of all products with image previews and availability status.
4. **Product CRUD:** Full capability to add, edit, and delete products with drag-and-drop image uploads to Supabase Storage.
5. **Order Management:** View all customer orders, see detailed item breakdowns, and update fulfillment status.

## Environment Setup
Required variables in `.env`:
- `VITE_SUPABASE_URL`: Your Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous/public key.

## Security & RLS
This CMS uses the **Anon Key** and **Supabase Auth**. To allow admins to read orders and manage products, ensure the following SQL policies are applied in your Supabase Dashboard:

```sql
-- 1. Allow authenticated users (Admins) to read all orders
CREATE POLICY "Admins can view all orders" 
ON public.orders 
FOR SELECT 
TO authenticated 
USING (true);

-- 2. Allow authenticated users (Admins) to update order status
CREATE POLICY "Admins can update order status" 
ON public.orders 
FOR UPDATE 
TO authenticated 
USING (true);

-- 3. Allow authenticated users (Admins) full access to products
CREATE POLICY "Admins have full access to products" 
ON public.products 
FOR ALL 
TO authenticated 
USING (true);
```

## Development Workflow
- Run development server: `npm run dev`
- Build for production: `npm run build`
- Linting: `npm run lint`
