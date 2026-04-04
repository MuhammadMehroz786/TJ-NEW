<p align="center">
  <img src="client/public/White.jpeg" alt="TijarFlow" width="200" />
</p>

<h1 align="center">TijarFlow</h1>

<p align="center">
  <strong>Unified marketplace management for SMBs</strong><br/>
  Connect multiple Shopify &amp; Salla stores. Sync, manage, and push products from one dashboard.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61dafb?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Express-5-000?logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169e1?logo=postgresql" alt="PostgreSQL" />
</p>

---

## Features

- **Multi-Store Connections** - Connect multiple Shopify and Salla stores simultaneously
- **Real Shopify Integration** - Sync and push products via the Shopify Admin API (client_credentials grant with auto-refresh)
- **Unified Product Catalog** - Manage all products in one place with search, filters, and bulk actions
- **Push to Marketplace** - Push any product to a connected store with one click
- **Drag & Drop Media** - Upload images via drag-and-drop, file browser, or URL with reorder support
- **Dashboard** - Overview stats, recent activity, and connection status at a glance
- **Secure Auth** - JWT-based authentication with bcrypt password hashing
- **Token Encryption** - Marketplace credentials encrypted at rest with AES-256-GCM

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui, Zustand |
| Backend | Express.js, Prisma ORM, PostgreSQL |
| Auth | Custom JWT (bcrypt + jsonwebtoken) |
| Encryption | AES-256-GCM (Node crypto) |
| API | Shopify Admin REST API (2025-01) |

## Project Structure

```
tijarflow/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components + layout
│       ├── pages/          # Route pages
│       ├── stores/         # Zustand state
│       └── lib/            # API client + utilities
├── server/                 # Express backend
│   └── src/
│       ├── routes/         # API endpoints
│       ├── services/       # Shopify API service + mappers
│       ├── middleware/      # Auth middleware
│       └── lib/            # Encryption utilities
├── shared/                 # Shared TypeScript types
└── docs/                   # Specs and plans
```

## Getting Started

### Prerequisites

- **Node.js** 18+
- **PostgreSQL** running locally
- **npm** 9+

### Setup

1. **Clone the repo**

```bash
git clone https://github.com/TijarFlowHQ/TijarFlow-V1.git
cd TijarFlow-V1
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment**

```bash
cp .env.example server/.env
```

Edit `server/.env`:

```env
DATABASE_URL=postgresql://youruser@localhost:5432/tijarflow
JWT_SECRET=pick-a-strong-secret
PORT=3001
TOKEN_ENCRYPTION_KEY=<64 hex chars>
```

Generate the encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. **Create the database and run migrations**

```bash
createdb tijarflow
cd server && npx prisma migrate deploy && cd ..
```

5. **Start the dev servers**

```bash
npm run dev
```

This starts both the API server (`localhost:3001`) and Vite dev server (`localhost:5173`) concurrently.

6. **Open the app**

Visit [http://localhost:5173](http://localhost:5173), create an account, and start connecting stores.

## Connecting Shopify

1. In your Shopify Admin, go to **Settings > Apps and sales channels > Develop apps**
2. Create or select an app
3. Under **API credentials**, copy the **API Key** and **API Secret Key**
4. Make sure the app has `write_products`, `write_inventory`, and `write_product_listings` scopes
5. In TijarFlow, go to **Marketplaces**, click the **+** button on Shopify, and enter your credentials

TijarFlow handles the token exchange and auto-refresh automatically. Tokens are encrypted at rest and refreshed every 24 hours.

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List (paginated, searchable, filterable) |
| GET | `/api/products/:id` | Get one |
| POST | `/api/products` | Create |
| PUT | `/api/products/:id` | Update |
| DELETE | `/api/products/:id` | Delete |
| PATCH | `/api/products/bulk` | Bulk status change / delete |
| POST | `/api/products/push` | Push to marketplace |

### Marketplaces
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/marketplaces` | List connections |
| POST | `/api/marketplaces/connect` | Connect store |
| DELETE | `/api/marketplaces/:id` | Disconnect |
| POST | `/api/marketplaces/:id/sync` | Sync products from store |

## Database Schema

Three main models:

- **User** - Auth credentials and profile
- **MarketplaceConnection** - Store credentials (encrypted), platform type, connection status
- **Product** - Unified product schema with marketplace linkage and platform-specific data

See [`server/prisma/schema.prisma`](server/prisma/schema.prisma) for the full schema.

## Security

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with 7-day expiry
- Marketplace access tokens and secrets encrypted with AES-256-GCM
- Sensitive fields never returned in API responses
- Store URLs validated against SSRF patterns

## License

Private - All rights reserved.

---

<p align="center">Built for SMBs in the MENA region</p>
