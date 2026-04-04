# TijarFlow MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the TijarFlow MVP — a marketplace management platform with auth, dashboard, product catalog, and marketplace connection UI with mock data.

**Architecture:** Monorepo with npm workspaces. React+Vite frontend with dark sidebar/light content layout. Express+Prisma backend with PostgreSQL. Custom JWT auth. Mock marketplace integrations.

**Tech Stack:** React 18, Vite, Tailwind CSS, shadcn/ui, React Router, Zustand, Express.js, Prisma, PostgreSQL, bcrypt, jsonwebtoken

**Spec:** `docs/superpowers/specs/2026-03-26-tijarflow-mvp-design.md`

---

## File Map

```
tijar-flow/
├── package.json                          # Workspace root
├── .gitignore
├── .env.example
├── shared/
│   └── types/
│       └── index.ts                      # All shared interfaces & enums
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   ├── prisma/
│   │   ├── schema.prisma                 # User, MarketplaceConnection, Product
│   │   └── seed.ts                       # Dev seed data
│   └── src/
│       ├── index.ts                      # Express app entry, CORS, routes
│       ├── middleware/
│       │   └── auth.ts                   # JWT verification middleware
│       ├── routes/
│       │   ├── auth.ts                   # signup, login, me
│       │   ├── products.ts               # CRUD + bulk + pagination
│       │   ├── marketplaces.ts           # connect, disconnect, sync (mock)
│       │   └── user.ts                   # profile, password
│       └── services/
│           └── mockData.ts               # Salla & Shopify mock product generators
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   ├── components.json                   # shadcn/ui config
│   └── src/
│       ├── main.tsx                      # App entry
│       ├── App.tsx                       # Router setup
│       ├── index.css                     # Tailwind imports + custom vars
│       ├── lib/
│       │   ├── api.ts                    # Axios instance with JWT interceptor
│       │   └── utils.ts                  # cn() helper for shadcn
│       ├── stores/
│       │   └── authStore.ts              # Zustand auth state
│       ├── hooks/
│       │   └── useAuth.ts               # Auth hook wrapping store
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Sidebar.tsx           # Dark sidebar with nav
│       │   │   ├── AppLayout.tsx         # Sidebar + content wrapper
│       │   │   └── AuthLayout.tsx        # Centered card layout for login/signup
│       │   ├── ProtectedRoute.tsx        # Auth guard component
│       │   └── ui/                       # shadcn/ui components (auto-generated)
│       └── pages/
│           ├── Login.tsx
│           ├── Signup.tsx
│           ├── Dashboard.tsx
│           ├── Products.tsx
│           ├── Marketplaces.tsx
│           └── Settings.tsx
```

---

## Task 1: Project Scaffolding & Monorepo Setup

**Files:** Create all config files at root, server/, client/, shared/

- [ ] **Step 1: Initialize root workspace**

Create `package.json` with npm workspaces pointing to `shared`, `server`, `client`.

- [ ] **Step 2: Create shared types package**

Create `shared/types/index.ts` with all enums (`Platform`, `ConnectionStatus`, `ProductStatus`) and interfaces (`User`, `Product`, `MarketplaceConnection`, `ApiError`, `PaginatedResponse`).
Create `shared/package.json` with name `@tijarflow/shared`.

- [ ] **Step 3: Scaffold server**

```bash
cd server && npm init -y
npm i express cors jsonwebtoken bcryptjs @prisma/client dotenv
npm i -D typescript @types/express @types/cors @types/jsonwebtoken @types/bcryptjs prisma ts-node tsx @types/node
npx tsc --init
```

Create `server/tsconfig.json` with paths to shared types.
Create `server/.env` with DATABASE_URL, JWT_SECRET, PORT.
Create `.env.example` at root.

- [ ] **Step 4: Scaffold client**

```bash
cd client
npm create vite@latest . -- --template react-ts
npm i react-router-dom zustand axios
npm i -D tailwindcss @tailwindcss/vite
npx shadcn@latest init
```

Configure `vite.config.ts` with API proxy to `localhost:3001`.
Set up `tailwind.config.js`, `postcss.config.js`, `index.css`.

- [ ] **Step 5: Create .gitignore and initialize git**

```bash
git init
git add .
git commit -m "chore: initial project scaffolding"
```

---

## Task 2: Database Schema & Prisma Setup

**Files:** Create `server/prisma/schema.prisma`

- [ ] **Step 1: Write Prisma schema**

Define `User`, `MarketplaceConnection`, `Product` models with all fields from spec. Include enums `Platform`, `ConnectionStatus`, `ProductStatus`. Use `uuid()` defaults, `@unique` on email, composite unique on `[sku, userId]`.

- [ ] **Step 2: Create and apply migration**

```bash
cd server
npx prisma migrate dev --name init
npx prisma generate
```

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add Prisma schema with User, Product, MarketplaceConnection"
```

---

## Task 3: Backend — Express Server & Auth Middleware

**Files:** Create `server/src/index.ts`, `server/src/middleware/auth.ts`

- [ ] **Step 1: Create Express entry point**

Set up Express app with JSON parsing, CORS (origin: `http://localhost:5173`), mount route prefixes at `/api/auth`, `/api/products`, `/api/marketplaces`, `/api/user`. Listen on `PORT` from env.

- [ ] **Step 2: Create JWT auth middleware**

Extract Bearer token from Authorization header. Verify with `jsonwebtoken`. Attach `userId` and `email` to `req`. Return 401 with `{ error, code: "UNAUTHORIZED" }` on failure.

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add Express server with JWT auth middleware"
```

---

## Task 4: Backend — Auth Routes

**Files:** Create `server/src/routes/auth.ts`

- [ ] **Step 1: Implement POST /api/auth/signup**

Validate email/password/name. Check for existing email (409 CONFLICT). Hash password with bcrypt (10 rounds). Create user in DB. Return JWT token (7-day expiry) with payload `{ userId, email }`.

- [ ] **Step 2: Implement POST /api/auth/login**

Validate email/password. Find user by email. Compare password with bcrypt. Return JWT or 401.

- [ ] **Step 3: Implement GET /api/auth/me**

Protected route. Return user data (id, email, name, createdAt) from JWT userId. Exclude password.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: add auth routes (signup, login, me)"
```

---

## Task 5: Backend — Product Routes

**Files:** Create `server/src/routes/products.ts`

- [ ] **Step 1: Implement GET /api/products**

Protected. Query by userId. Support query params: `page` (default 1), `pageSize` (default 20), `search` (title LIKE), `status` filter, `marketplace` filter (join through marketplaceConnection). Return `{ data, total, page, pageSize }`.

- [ ] **Step 2: Implement POST /api/products**

Protected. Validate required fields (title, price, currency, quantity, status). Create product with userId from JWT.

- [ ] **Step 3: Implement GET /api/products/:id, PUT, DELETE**

GET: Find by id + userId, 404 if not found.
PUT: Update product fields, validate ownership.
DELETE: Delete by id + userId.

- [ ] **Step 4: Implement PATCH /api/products/bulk**

Accept `{ ids: string[], action: "activate"|"archive"|"draft"|"delete" }`. For delete, use `deleteMany`. For others, `updateMany` status.

- [ ] **Step 5: Commit**

```bash
git add . && git commit -m "feat: add product CRUD routes with pagination and bulk actions"
```

---

## Task 6: Backend — Marketplace Routes & Mock Data

**Files:** Create `server/src/routes/marketplaces.ts`, `server/src/services/mockData.ts`

- [ ] **Step 1: Create mock data generators**

`generateSallaProducts(connectionId, userId)` — 12 products with Arabic names (abayas, oud perfume, dates, etc.), SAR currency, Saudi categories.
`generateShopifyProducts(connectionId, userId)` — 12 products with English names, USD currency, general ecommerce categories.
Use placeholder image URLs like `https://placehold.co/400x400?text=ProductName`.

- [ ] **Step 2: Implement marketplace routes**

GET `/api/marketplaces` — list connections by userId.
POST `/api/marketplaces/connect` — create connection with status CONNECTED.
DELETE `/api/marketplaces/:id` — delete connection + associated products.
POST `/api/marketplaces/:id/sync` — call mock data generator, insert products, return count.

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add marketplace routes with mock Salla/Shopify data"
```

---

## Task 7: Backend — User Routes

**Files:** Create `server/src/routes/user.ts`

- [ ] **Step 1: Implement user routes**

PUT `/api/user/profile` — update name, email (check uniqueness).
PUT `/api/user/password` — verify current password, hash new password, update.

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add user profile and password routes"
```

---

## Task 8: Frontend — Base Setup, API Client & Auth Store

**Files:** Create `client/src/lib/api.ts`, `client/src/stores/authStore.ts`, `client/src/hooks/useAuth.ts`

- [ ] **Step 1: Create API client**

Axios instance with `baseURL` from `VITE_API_URL` (fallback `/api`). Request interceptor to attach JWT from localStorage. Response interceptor to catch 401 and clear auth.

- [ ] **Step 2: Create auth store (Zustand)**

State: `user`, `token`, `isAuthenticated`, `isLoading`.
Actions: `login(email, password)`, `signup(name, email, password)`, `logout()`, `fetchUser()`.
Persist token in localStorage. On init, if token exists, call `/api/auth/me`.

- [ ] **Step 3: Create useAuth hook**

Thin wrapper around the Zustand store for convenience.

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: add API client and auth store"
```

---

## Task 9: Frontend — Layouts & Routing

**Files:** Create `client/src/App.tsx`, layout components, `ProtectedRoute.tsx`

Use **@frontend-design** skill for UI implementation in this and all subsequent frontend tasks.

- [ ] **Step 1: Install shadcn/ui components needed**

```bash
cd client
npx shadcn@latest add button input label card avatar dropdown-menu table badge dialog select separator toast
```

- [ ] **Step 2: Create AuthLayout**

Centered layout with a card in the middle. Light background with subtle gradient. TijarFlow logo (White.jpeg) above the card.

- [ ] **Step 3: Create Sidebar**

Dark sidebar (`bg-slate-900`). White logo at top. Nav items: Dashboard (LayoutDashboard icon), Products (Package), Marketplaces (Store), Settings (Settings). Active state with teal/green accent. User avatar + name at bottom with logout dropdown.

- [ ] **Step 4: Create AppLayout**

Sidebar on left (w-64, fixed). Content area on right with padding, light background (`bg-slate-50`). Page header slot.

- [ ] **Step 5: Create ProtectedRoute**

Check `isAuthenticated` from auth store. If not, redirect to `/login`. Show loading spinner while checking.

- [ ] **Step 6: Set up React Router in App.tsx**

Public routes: `/login` → Login, `/signup` → Signup.
Protected routes (wrapped in AppLayout): `/` → Dashboard, `/products` → Products, `/marketplaces` → Marketplaces, `/settings` → Settings.

- [ ] **Step 7: Commit**

```bash
git add . && git commit -m "feat: add layouts, sidebar, routing, and protected routes"
```

---

## Task 10: Frontend — Auth Pages (Login & Signup)

**Files:** Create `client/src/pages/Login.tsx`, `client/src/pages/Signup.tsx`

- [ ] **Step 1: Build Login page**

AuthLayout wrapper. Card with "Welcome back" heading. Email + password inputs (shadcn). Submit button with loading state. Error toast on failure. Link to `/signup`. On success, redirect to `/`.

- [ ] **Step 2: Build Signup page**

Same layout. "Create your account" heading. Name + email + password inputs. Submit button. Link to `/login`. On success, redirect to `/`.

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add login and signup pages"
```

---

## Task 11: Frontend — Dashboard Page

**Files:** Create `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Build Dashboard**

Page header: "Welcome back, {name}".
Stats cards row (4 cards): Total Products, Active Products, Connected Marketplaces, Draft Products. Each card with icon, label, and count fetched from API.
Recent activity section: list of recent product/connection changes with timestamps, derived from `GET /api/products?pageSize=5&sort=updatedAt`.

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add dashboard page with stats and recent activity"
```

---

## Task 12: Frontend — Products Page

**Files:** Create `client/src/pages/Products.tsx`

- [ ] **Step 1: Build Products page**

Page header with "Products" title and "Add Product" button.
Search input + status filter dropdown + marketplace filter dropdown.
Data table (shadcn Table) with columns: checkbox, image thumbnail, title, SKU, price (with currency), status badge (green/yellow/gray), marketplace badge, actions dropdown (edit, delete).
Bulk action toolbar (appears when items selected): "Delete Selected", "Set Active", "Set Draft", "Archive".
Pagination controls at bottom.

- [ ] **Step 2: Add product create/edit dialog**

Modal dialog with form fields: title, description, price, currency, SKU, barcode, quantity, category, status dropdown. Save calls POST or PUT.

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add products page with table, filters, bulk actions, and CRUD dialog"
```

---

## Task 13: Frontend — Marketplaces Page

**Files:** Create `client/src/pages/Marketplaces.tsx`

- [ ] **Step 1: Build Marketplaces page**

Page header: "Marketplace Connections".
Two large cards side by side:
- **Salla** card: Salla logo/icon, connection status badge, store name (if connected), "Connect" or "Disconnect" button, "Sync Products" button (if connected).
- **Shopify** card: Same layout with Shopify branding.

- [ ] **Step 2: Add connect dialog**

Modal with fields: Store Name, Store URL, API Key. Platform is pre-selected based on which card's "Connect" was clicked. On submit, call POST `/api/marketplaces/connect`.

- [ ] **Step 3: Add sync functionality**

"Sync Products" button calls POST `/api/marketplaces/:id/sync`. Show loading spinner during sync. Toast notification with "Synced X products from Salla/Shopify".

- [ ] **Step 4: Commit**

```bash
git add . && git commit -m "feat: add marketplaces page with connect/sync UI"
```

---

## Task 14: Frontend — Settings Page

**Files:** Create `client/src/pages/Settings.tsx`

- [ ] **Step 1: Build Settings page**

Two sections:
- **Profile**: name + email inputs, "Save Changes" button. Pre-filled from auth store.
- **Change Password**: current password, new password, confirm password. "Update Password" button.
Both with success/error toasts.

- [ ] **Step 2: Commit**

```bash
git add . && git commit -m "feat: add settings page with profile and password forms"
```

---

## Task 15: Backend — Dashboard Stats Endpoint

**Files:** Modify `server/src/routes/products.ts` or create `server/src/routes/dashboard.ts`

- [ ] **Step 1: Add GET /api/dashboard/stats**

Protected. Return:
```json
{
  "totalProducts": 42,
  "activeProducts": 30,
  "draftProducts": 8,
  "archivedProducts": 4,
  "connectedMarketplaces": 2,
  "recentActivity": [{ "type": "product_created", "title": "...", "timestamp": "..." }]
}
```
Query products and connections for the authenticated user. Recent activity = last 10 products/connections ordered by updatedAt.

- [ ] **Step 2: Mount route in server index**

- [ ] **Step 3: Commit**

```bash
git add . && git commit -m "feat: add dashboard stats endpoint"
```

---

## Task 16: Polish & Final Integration

- [ ] **Step 1: Add loading states**

Skeleton loaders on Dashboard cards, Products table, Marketplaces cards while data loads.

- [ ] **Step 2: Add empty states**

"No products yet" illustration on Products page. "Connect a marketplace to get started" on Marketplaces when nothing connected.

- [ ] **Step 3: Add toast notifications**

Wire up shadcn Toast for all success/error actions across the app.

- [ ] **Step 4: Test full flow end-to-end**

1. Start server (`npm run dev` in server)
2. Start client (`npm run dev` in client)
3. Sign up → lands on Dashboard → connect Salla → sync products → view in Products table → edit a product → change password in Settings → logout → login

- [ ] **Step 5: Final commit**

```bash
git add . && git commit -m "feat: add polish — loading states, empty states, toasts"
```

---

## Execution Notes

- Tasks 1-7 are backend, Tasks 8-14 are frontend, Task 15-16 are integration
- Tasks 1-2 must be sequential (scaffolding before schema)
- Tasks 3-7 can be parallelized (independent backend routes)
- Task 8 must come before Tasks 9-14 (API client needed first)
- Task 9 must come before Tasks 10-14 (layouts needed first)
- Tasks 10-14 can be parallelized (independent pages)
- Use `@frontend-design` skill for all UI tasks (9-14, 16)
