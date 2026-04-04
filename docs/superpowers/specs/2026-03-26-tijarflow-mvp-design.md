# TijarFlow MVP Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Phase:** 1 (MVP)

## Overview

TijarFlow is a marketplace management platform for SMBs in Saudi Arabia. Phase 1 delivers user authentication, a dashboard, marketplace connection UI (Salla & Shopify with mock data), and a unified product catalog.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + shadcn/ui + React Router + Zustand |
| Backend | Express.js + TypeScript + Prisma ORM |
| Database | PostgreSQL |
| Auth | Custom JWT (bcrypt + jsonwebtoken) |
| Architecture | Monorepo with npm workspaces + shared types |

## Project Structure

```
tijar-flow/
├── client/
│   ├── src/
│   │   ├── components/     # Reusable UI components (sidebar, cards, tables)
│   │   ├── pages/          # Login, Signup, Dashboard, Products, Marketplaces, Settings
│   │   ├── hooks/          # Custom React hooks (useAuth, useProducts, etc.)
│   │   ├── lib/            # API client, utils
│   │   └── stores/         # Zustand state management
│   ├── public/
│   └── index.html
├── server/
│   ├── src/
│   │   ├── routes/         # Auth, products, marketplaces, user routes
│   │   ├── middleware/     # JWT auth middleware
│   │   ├── services/       # Business logic layer
│   │   └── index.ts        # Express app entry
│   └── prisma/
│       ├── schema.prisma
│       └── seed.ts
├── shared/
│   └── types/              # Shared TypeScript interfaces
└── package.json            # Workspace root
```

## Database Schema

### User
- `id` — UUID, primary key
- `email` — string, unique
- `password` — string (bcrypt hashed)
- `name` — string
- `createdAt` — timestamp
- `updatedAt` — timestamp

### MarketplaceConnection
- `id` — UUID, primary key
- `userId` — FK to User
- `platform` — enum (SALLA, SHOPIFY)
- `storeName` — string
- `storeUrl` — string
- `accessToken` — string (encrypted)
- `status` — enum (CONNECTED, DISCONNECTED, PENDING)
- `createdAt` — timestamp
- `updatedAt` — timestamp

### Product (Unified Schema)
- `id` — UUID, primary key
- `userId` — FK to User
- `marketplaceConnectionId` — FK to MarketplaceConnection (nullable for manual products)
- `title` — string
- `description` — text
- `price` — decimal
- `compareAtPrice` — decimal (nullable)
- `sku` — string
- `barcode` — string (nullable)
- `currency` — string (e.g. "SAR", "USD")
- `quantity` — integer
- `images` — JSON (array of URL strings)
- `category` — string
- `tags` — JSON (array of strings)
- `status` — enum (ACTIVE, DRAFT, ARCHIVED)
- `platformProductId` — string (nullable, original marketplace ID)
- `platformData` — JSON (nullable, raw marketplace-specific fields)
- `createdAt` — timestamp
- `updatedAt` — timestamp

### Field Requirements
- **Required on create**: title, price, currency, quantity, status
- **Optional**: description, compareAtPrice, sku, barcode, images, category, tags, platformProductId, platformData
- `sku` is unique per user (when provided)
- `title` max 255 chars, `description` max 5000 chars

## API Conventions

### Authentication
- JWT tokens expire after 7 days (no refresh tokens for MVP)
- Token stored in localStorage on the client
- Token payload: `{ userId: string, email: string, iat, exp }`
- Sent via `Authorization: Bearer <token>` header

### Error Response Shape
```json
{ "error": "Human-readable message", "code": "VALIDATION_ERROR" }
```
Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`

### Pagination Response Shape
```json
{ "data": [...], "total": 100, "page": 1, "pageSize": 20 }
```
Query params: `?page=1&pageSize=20&search=term&status=ACTIVE&marketplace=SALLA`

## API Routes

### Auth (public)
- `POST /api/auth/signup` — create account, return JWT
- `POST /api/auth/login` — validate credentials, return JWT
- `GET /api/auth/me` — get current user from token

### Products (protected)
- `GET /api/products` — list products (search, filter, paginate)
- `GET /api/products/:id` — get single product
- `POST /api/products` — create product
- `PUT /api/products/:id` — update product
- `DELETE /api/products/:id` — delete product
- `PATCH /api/products/bulk` — bulk actions. Body: `{ ids: string[], action: "activate"|"archive"|"draft"|"delete" }`

### Marketplaces (protected)
- `GET /api/marketplaces` — list user's connections
- `POST /api/marketplaces/connect` — connect a marketplace (mock). Body: `{ platform: "SALLA"|"SHOPIFY", storeName: string, storeUrl: string, accessToken: string }`
- `DELETE /api/marketplaces/:id` — disconnect
- `POST /api/marketplaces/:id/sync` — trigger product sync (mock, generates sample data)

### User (protected)
- `PUT /api/user/profile` — update name/email
- `PUT /api/user/password` — change password

## Pages & UI

### Theme
- Dark sidebar (left) with white logo, nav links, user avatar + logout
- Light content area (right) with page header + content
- Color palette derived from brand (teal/green accent from logo)

### Auth Pages (public)
- **Login** — email + password form, link to signup
- **Signup** — name + email + password form, link to login

### App Pages (protected)
1. **Dashboard** — welcome message, stats cards (total products, connected marketplaces, active/draft counts), recent activity list (derived from product/connection `createdAt`/`updatedAt` timestamps — no separate activity table)
2. **Products** — searchable/filterable data table with columns: image, title, SKU, price, status badge, marketplace badge. Bulk action toolbar.
3. **Marketplace Connections** — cards for Salla & Shopify showing connection status, store name. "Connect" button opens modal (store URL + API key). "Sync" button generates mock products.
4. **Settings** — profile info form, change password form

## Mock Data Strategy

When a user "connects" a marketplace and triggers sync:
- **Salla**: 10-15 products with Arabic names, SAR pricing, Saudi-relevant categories
- **Shopify**: 10-15 products with English names, USD pricing, standard ecommerce categories
- Randomized images (placeholder URLs), SKUs, stock quantities, and statuses

## Environment & Config
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — secret for signing tokens
- `PORT` — server port (default 3001)
- `VITE_API_URL` — API base URL for frontend (default `http://localhost:3001/api`)
- CORS enabled for `http://localhost:5173` in development

## Known Tech Debt
- `images` and `tags` as JSON columns — migrate to junction tables if filtering needed
- `accessToken` stored as plain string for mock phase — encrypt before real integrations
- No refresh token flow — add before production

## Out of Scope (Phase 1)
- Real marketplace API integration
- AI image enhancement
- WhatsApp/Messenger chatbot
- Field mapping configuration UI
- Multi-language i18n
