# TijarFlow — Development Progress

> Last updated: April 2, 2026

---

## Implemented Features

### Core Platform (v1.0)

| Feature | Status | Notes |
|---------|--------|-------|
| User Authentication | Done | JWT-based, bcrypt passwords, 7-day token expiry |
| Shopify Integration | Done | Real API — connect, sync, push via client_credentials grant |
| Salla Integration | Partial | Connect works, sync/push returns mock data |
| Product Catalog | Done | Full CRUD, search, filter, pagination, bulk actions |
| Push to Marketplace | Done | Real for Shopify, simulated for Salla |
| Image Management | Done | Drag-and-drop, URL input, reorder, cover badge |
| Multi-Store Support | Done | Multiple stores per platform per user |
| Token Encryption | Done | AES-256-GCM at rest for all marketplace credentials |
| Token Auto-Refresh | Done | Shopify tokens refreshed automatically before expiry |
| Dashboard | Done | Product stats, marketplace counts, recent activity |
| Settings | Done | Profile edit, password change |
| Shopify Setup Guide | Done | Step-by-step guide for connecting Shopify stores |

### Creator & Advertising System (v1.1) — NEW

| Feature | Status | Notes |
|---------|--------|-------|
| Role-Based Accounts | Done | MERCHANT and CREATOR roles, selected at signup |
| Two-Step Signup Wizard | Done | Step 1: choose role, Step 2: fill form |
| Role-Based Routing | Done | Separate sidebars, routes, and dashboards per role |
| Creator Profile | Done | Display name, bio, niche, rate, social platforms, portfolio, availability toggle |
| Browse Creators | Done | Card grid with niche filter, follower sort, rate display |
| Campaign Creation | Done | Merchant selects product + creator, writes brief, sends request |
| Campaign Lifecycle | Done | PENDING → ACCEPTED → IN_PROGRESS → SUBMITTED → APPROVED → COMPLETED |
| Accept/Decline Requests | Done | Creator can accept or decline incoming campaign requests |
| Social Link Submission | Done | Creator pastes social media post URLs as proof of work |
| Merchant Review | Done | Merchant can approve or request revision with notes |
| Revision Loop | Done | Merchant sends revision note → creator resubmits → merchant re-reviews |
| Mock Escrow Payments | Done | Payment held on create, released on approve, refunded on decline |
| Creator Dashboard | Done | Stats (active, completed, earnings, pending), new requests, recent campaigns |
| Merchant Advertising Page | Done | Campaign table with status filters, detail view, approve/revision actions |
| Product "Advertise" Action | Done | "Advertise" option in product row menu opens creator browse dialog |
| Merchant Dashboard Update | Done | Active campaigns stat card added |

---

## Database Models

| Model | Status | Description |
|-------|--------|-------------|
| User | Done | Auth, profile, role (MERCHANT/CREATOR) |
| MarketplaceConnection | Done | Store credentials (encrypted), platform, status |
| Product | Done | Unified product schema with marketplace linkage |
| CreatorProfile | Done | Creator's public profile, social platforms, rate |
| Campaign | Done | Advertising campaign between merchant and creator |
| Payment | Done | Mock escrow — tracks HELD/RELEASED/REFUNDED status |

---

## API Endpoints

### Auth
| Method | Endpoint | Status |
|--------|----------|--------|
| POST | `/api/auth/signup` | Done — now accepts `role` param |
| POST | `/api/auth/login` | Done — returns role in response |
| GET | `/api/auth/me` | Done — returns role in response |

### Products
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/products` | Done |
| GET | `/api/products/:id` | Done |
| POST | `/api/products` | Done |
| PUT | `/api/products/:id` | Done |
| DELETE | `/api/products/:id` | Done |
| PATCH | `/api/products/bulk` | Done |
| POST | `/api/products/push` | Done |

### Marketplaces
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/marketplaces` | Done |
| POST | `/api/marketplaces/connect` | Done |
| DELETE | `/api/marketplaces/:id` | Done |
| POST | `/api/marketplaces/:id/sync` | Done |

### Creators
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/creators` | Done — browse available creators (merchant-only) |
| GET | `/api/creators/profile` | Done — get own profile (creator-only) |
| PUT | `/api/creators/profile` | Done — create/update own profile (creator-only) |

### Campaigns
| Method | Endpoint | Status |
|--------|----------|--------|
| POST | `/api/campaigns` | Done — create campaign (merchant-only) |
| GET | `/api/campaigns` | Done — list campaigns (both roles) |
| GET | `/api/campaigns/:id` | Done — campaign detail (both roles) |
| PATCH | `/api/campaigns/:id/accept` | Done — creator accepts |
| PATCH | `/api/campaigns/:id/decline` | Done — creator declines, payment refunded |
| PATCH | `/api/campaigns/:id/submit` | Done — creator submits social links |
| PATCH | `/api/campaigns/:id/approve` | Done — merchant approves, payment released |
| PATCH | `/api/campaigns/:id/revision` | Done — merchant requests revision |

### Dashboard
| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/dashboard/stats` | Done — role-aware (merchant vs creator stats) |

---

## What's Remaining

### High Priority
- [ ] **Real Salla Integration** — Replace mock sync/push with actual Salla API calls
- [ ] **Real Payment Gateway** — Integrate Moyasar or Stripe to replace mock escrow (currently just status tracking)
- [ ] **Product Variants** — Only first Shopify variant is extracted; multi-variant products lose data
- [ ] **Webhook Support** — Real-time product updates from Shopify/Salla instead of manual sync only

### Medium Priority
- [ ] **Image CDN/Upload** — Currently images stored as URLs or base64; need proper upload-to-CDN pipeline
- [ ] **Error Retry Queue** — Failed syncs/pushes need manual retry; add automatic retry with backoff
- [ ] **Notifications** — Email or in-app notifications when campaign status changes
- [ ] **Creator Ratings/Reviews** — Allow merchants to rate creators after campaign completion
- [ ] **Campaign Analytics** — Track engagement metrics from social media links
- [ ] **Chat/Messaging** — In-app messaging between merchant and creator within a campaign

### Low Priority / Nice to Have
- [ ] **Campaign Deadline** — Allow merchants to set a deadline for when the creator should deliver
- [ ] **Multiple Products per Campaign** — Currently one product per campaign
- [ ] **Creator Categories/Tags** — More granular filtering beyond single niche
- [ ] **Bulk Campaign Creation** — Send campaign requests to multiple creators at once
- [ ] **Export/Reports** — Download campaign history, earnings reports as CSV
- [ ] **Dark Mode** — Full dark mode support across the app
- [ ] **Mobile Responsive** — Optimize layout for mobile devices
- [ ] **i18n / Arabic Support** — Localization for Arabic-speaking users in Saudi Arabia

### Deployment
- [ ] **DigitalOcean Setup** — Droplet + Nginx + PM2 + PostgreSQL + Certbot SSL
- [ ] **CI/CD Pipeline** — Automated testing and deployment on push
- [ ] **Environment Config** — Production environment variables and secrets management

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS 4, shadcn/ui, Zustand |
| Backend | Express.js 5, Prisma 6 ORM, PostgreSQL 16 |
| Auth | Custom JWT (bcrypt + jsonwebtoken, 7-day expiry) |
| Encryption | AES-256-GCM (Node built-in crypto) |
| API | Shopify Admin REST API (2025-01) |
| Monorepo | npm workspaces (shared/, server/, client/) |

---

## Running Locally

```bash
npm install                        # Install all workspaces
cp .env.example server/.env        # Configure environment
cd server && npx prisma migrate deploy && cd ..  # Run migrations
npm run dev                        # Server on :3001, Client on :5173
```

Required in `server/.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for JWT signing
- `PORT` — Server port (default 3001)
- `TOKEN_ENCRYPTION_KEY` — 32-byte hex key (64 chars) for AES-256-GCM
