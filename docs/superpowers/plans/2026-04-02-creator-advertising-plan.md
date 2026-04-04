# Creator & Advertising Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two-sided marketplace where merchants hire content creators to advertise products, with role-based auth, creator profiles, campaigns, and mock escrow payments.

**Architecture:** Extends existing Express + Prisma + React monorepo. New Prisma models (CreatorProfile, Campaign, Payment) with new enums. Backend gets new route files for creators and campaigns. Frontend gets role-based routing — merchants see existing pages plus new Advertising page, creators see a completely separate set of pages (Dashboard, Campaigns, Profile). Signup becomes a two-step wizard.

**Tech Stack:** React 18, Vite, Tailwind CSS 4, shadcn/ui, Zustand, Express.js, Prisma 6, PostgreSQL 16

---

## File Map

### Backend — Modified Files
- `server/prisma/schema.prisma` — Add UserRole, CampaignStatus, PaymentStatus enums; add role to User; add CreatorProfile, Campaign, Payment models
- `server/src/index.ts` — Register new route files
- `server/src/routes/auth.ts` — Accept role on signup, include role in JWT and responses
- `server/src/middleware/auth.ts` — Add role to AuthRequest, add `requireRole()` middleware
- `server/src/routes/dashboard.ts` — Add campaign stats for both roles

### Backend — New Files
- `server/src/routes/creators.ts` — GET /api/creators (browse), GET/PUT /api/creators/profile (own profile)
- `server/src/routes/campaigns.ts` — Full campaign CRUD + lifecycle actions

### Frontend — Modified Files
- `shared/types/index.ts` — Add UserRole, CampaignStatus, PaymentStatus enums; CreatorProfile, Campaign, Payment interfaces; update User interface
- `client/src/stores/authStore.ts` — Add role to User, pass role on signup
- `client/src/components/ProtectedRoute.tsx` — Add optional role prop for route gating
- `client/src/components/layout/Sidebar.tsx` — Role-based nav items
- `client/src/App.tsx` — Role-based route sets
- `client/src/pages/Signup.tsx` — Two-step wizard with role selection
- `client/src/pages/Products.tsx` — Add "Advertise" action to product row menu
- `client/src/pages/Dashboard.tsx` — Add campaign stat card for merchants

### Frontend — New Files
- `client/src/components/ui/tabs.tsx` — shadcn Tabs component (needed for filter tabs)
- `client/src/components/ui/textarea.tsx` — shadcn Textarea component (needed for brief input)
- `client/src/components/ui/switch.tsx` — shadcn Switch component (needed for availability toggle)
- `client/src/pages/Advertising.tsx` — Merchant's campaign management page
- `client/src/pages/CreatorDashboard.tsx` — Creator's all-in-one dashboard
- `client/src/pages/Campaigns.tsx` — Creator's campaign list + detail views
- `client/src/pages/CreatorProfile.tsx` — Creator's profile edit page
- `client/src/components/layout/CreatorSidebar.tsx` — Creator-specific sidebar

---

## Task 1: Database Schema — New Enums and Models

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add new enums and role to User model**

Add to `server/prisma/schema.prisma` after existing enums:

```prisma
enum UserRole {
  MERCHANT
  CREATOR
}

enum CampaignStatus {
  PENDING
  ACCEPTED
  DECLINED
  IN_PROGRESS
  SUBMITTED
  REVISION_REQUESTED
  APPROVED
  COMPLETED
}

enum PaymentStatus {
  HELD
  RELEASED
  REFUNDED
}
```

Add `role` field to the `User` model (after `name`):

```prisma
  role      UserRole @default(MERCHANT)
```

Add relations to `User` model (after `products`):

```prisma
  creatorProfile         CreatorProfile?
  merchantCampaigns      Campaign[]       @relation("MerchantCampaigns")
  creatorCampaigns       Campaign[]       @relation("CreatorCampaigns")
```

- [ ] **Step 2: Add CreatorProfile model**

Add after the User model:

```prisma
model CreatorProfile {
  id              String   @id @default(uuid())
  userId          String   @unique
  displayName     String
  bio             String?  @db.Text
  profilePhoto    String?
  niche           String
  rate            Decimal  @db.Decimal(10, 2)
  socialPlatforms Json     @default("[]")
  portfolioLinks  Json     @default("[]")
  isAvailable     Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Add Campaign model**

```prisma
model Campaign {
  id           String         @id @default(uuid())
  merchantId   String
  creatorId    String
  productId    String
  status       CampaignStatus @default(PENDING)
  brief        String         @db.Text
  amount       Decimal        @db.Decimal(10, 2)
  socialLinks  Json           @default("[]")
  revisionNote String?        @db.Text
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  merchant User    @relation("MerchantCampaigns", fields: [merchantId], references: [id], onDelete: Cascade)
  creator  User    @relation("CreatorCampaigns", fields: [creatorId], references: [id], onDelete: Cascade)
  product  Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  payment  Payment?
}
```

Add the `campaigns` relation to the `Product` model (after `marketplaceConnection` relation):

```prisma
  campaigns             Campaign[]
```

- [ ] **Step 4: Add Payment model**

```prisma
model Payment {
  id         String        @id @default(uuid())
  campaignId String        @unique
  amount     Decimal       @db.Decimal(10, 2)
  status     PaymentStatus @default(HELD)
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 5: Run migration**

```bash
cd server && npx prisma migrate dev --name add-creator-advertising
```

Expected: Migration created and applied successfully. Prisma client regenerated.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: add schema for creator profiles, campaigns, and payments"
```

---

## Task 2: Shared Types

**Files:**
- Modify: `shared/types/index.ts`

- [ ] **Step 1: Add new enums and interfaces**

Add to `shared/types/index.ts` after existing enums:

```typescript
export enum UserRole {
  MERCHANT = "MERCHANT",
  CREATOR = "CREATOR",
}

export enum CampaignStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  DECLINED = "DECLINED",
  IN_PROGRESS = "IN_PROGRESS",
  SUBMITTED = "SUBMITTED",
  REVISION_REQUESTED = "REVISION_REQUESTED",
  APPROVED = "APPROVED",
  COMPLETED = "COMPLETED",
}

export enum PaymentStatus {
  HELD = "HELD",
  RELEASED = "RELEASED",
  REFUNDED = "REFUNDED",
}
```

Add `role` to the existing `User` interface:

```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
```

Add new interfaces at the end of the file:

```typescript
export interface SocialPlatformEntry {
  platform: "instagram" | "tiktok" | "snapchat" | "twitter" | "youtube";
  handle: string;
  followerCount: number;
}

export interface CreatorProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  profilePhoto: string | null;
  niche: string;
  rate: number;
  socialPlatforms: SocialPlatformEntry[];
  portfolioLinks: string[];
  isAvailable: boolean;
  completedCampaigns?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  merchantId: string;
  creatorId: string;
  productId: string;
  status: CampaignStatus;
  brief: string;
  amount: number;
  socialLinks: { platform: string; url: string }[];
  revisionNote: string | null;
  product?: Product;
  merchant?: User;
  creator?: User;
  creatorProfile?: CreatorProfile;
  payment?: Payment;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  campaignId: string;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/types/index.ts
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: add shared types for creator profiles, campaigns, and payments"
```

---

## Task 3: Backend Auth — Role Support

**Files:**
- Modify: `server/src/middleware/auth.ts`
- Modify: `server/src/routes/auth.ts`

- [ ] **Step 1: Update auth middleware to include role and add requireRole helper**

Replace the full contents of `server/src/middleware/auth.ts`:

```typescript
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  auth?: {
    userId: string;
    email: string;
    role: string;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided", code: "UNAUTHORIZED" });
    return;
  }

  try {
    const token = header.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      email: string;
      role: string;
    };
    req.auth = { userId: payload.userId, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token", code: "UNAUTHORIZED" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}
```

- [ ] **Step 2: Update auth routes to handle role**

In `server/src/routes/auth.ts`, update the `generateToken` function to include role:

```typescript
function generateToken(userId: string, email: string, role: string): string {
  return jwt.sign({ userId, email, role }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}
```

In the signup route handler, accept role from request body and include in user creation:

Change:
```typescript
    const { email, password, name } = req.body;
```
To:
```typescript
    const { email, password, name, role } = req.body;
```

Add validation after the existing required-fields check:

```typescript
    if (role && role !== "MERCHANT" && role !== "CREATOR") {
      res.status(400).json({ error: "Role must be MERCHANT or CREATOR", code: "VALIDATION_ERROR" });
      return;
    }
```

Update the user creation:

Change:
```typescript
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });
```
To:
```typescript
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: role || "MERCHANT" },
    });
```

Update the token generation in signup:

Change:
```typescript
    const token = generateToken(user.id, user.email);
```
To:
```typescript
    const token = generateToken(user.id, user.email, user.role);
```

Update the signup response to include role:

Change:
```typescript
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, updatedAt: user.updatedAt },
    });
```
To:
```typescript
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt },
    });
```

In the login route, update the token generation:

Change:
```typescript
    const token = generateToken(user.id, user.email);
```
To:
```typescript
    const token = generateToken(user.id, user.email, user.role);
```

Update the login response to include role:

Change:
```typescript
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, updatedAt: user.updatedAt },
    });
```
To:
```typescript
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt },
    });
```

In the `/me` route, add `role` to the select:

Change:
```typescript
      select: { id: true, email: true, name: true, createdAt: true, updatedAt: true },
```
To:
```typescript
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
```

- [ ] **Step 3: Commit**

```bash
git add server/src/middleware/auth.ts server/src/routes/auth.ts
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: add role support to auth system"
```

---

## Task 4: Backend — Creator Profile Routes

**Files:**
- Create: `server/src/routes/creators.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create creators route file**

Create `server/src/routes/creators.ts`:

```typescript
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/creators — Browse available creators (merchant-only)
router.get("/", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { niche, sort = "followers", page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * pageSize;

    const where: Record<string, unknown> = {
      isAvailable: true,
      displayName: { not: "" },
      niche: { not: "" },
      rate: { gt: 0 },
    };

    if (niche) {
      where.niche = niche;
    }

    const [profiles, total] = await Promise.all([
      prisma.creatorProfile.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          user: {
            select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
          },
        },
      }),
      prisma.creatorProfile.count({ where }),
    ]);

    // Get completed campaign counts for each creator
    const creatorIds = profiles.map((p) => p.userId);
    const campaignCounts = await prisma.campaign.groupBy({
      by: ["creatorId"],
      where: { creatorId: { in: creatorIds }, status: "COMPLETED" },
      _count: { id: true },
    });
    const countMap = new Map(campaignCounts.map((c) => [c.creatorId, c._count.id]));

    let results = profiles.map((p) => ({
      id: p.id,
      userId: p.userId,
      displayName: p.displayName,
      bio: p.bio,
      profilePhoto: p.profilePhoto,
      niche: p.niche,
      rate: p.rate,
      socialPlatforms: p.socialPlatforms,
      portfolioLinks: p.portfolioLinks,
      isAvailable: p.isAvailable,
      completedCampaigns: countMap.get(p.userId) || 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    // Sort
    if (sort === "followers") {
      results.sort((a, b) => {
        const maxA = Math.max(0, ...(a.socialPlatforms as { followerCount: number }[]).map((s) => s.followerCount));
        const maxB = Math.max(0, ...(b.socialPlatforms as { followerCount: number }[]).map((s) => s.followerCount));
        return maxB - maxA;
      });
    } else if (sort === "rate") {
      results.sort((a, b) => Number(a.rate) - Number(b.rate));
    }

    res.json({ data: results, total, page: pageNum, pageSize });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/creators/profile — Get own creator profile
router.get("/profile", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: req.auth!.userId },
    });

    res.json({ profile });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PUT /api/creators/profile — Create or update own creator profile
router.put("/profile", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { displayName, bio, profilePhoto, niche, rate, socialPlatforms, portfolioLinks, isAvailable } = req.body;

    if (!displayName || !niche || !rate) {
      res.status(400).json({ error: "displayName, niche, and rate are required", code: "VALIDATION_ERROR" });
      return;
    }

    if (!Array.isArray(socialPlatforms) || socialPlatforms.length === 0) {
      res.status(400).json({ error: "At least one social platform is required", code: "VALIDATION_ERROR" });
      return;
    }

    const validPlatforms = ["instagram", "tiktok", "snapchat", "twitter", "youtube"];
    for (const sp of socialPlatforms) {
      if (!validPlatforms.includes(sp.platform) || !sp.handle || sp.followerCount == null) {
        res.status(400).json({ error: "Each social platform needs a valid platform, handle, and followerCount", code: "VALIDATION_ERROR" });
        return;
      }
    }

    const data = {
      displayName,
      bio: bio || null,
      profilePhoto: profilePhoto || null,
      niche,
      rate: parseFloat(rate),
      socialPlatforms,
      portfolioLinks: portfolioLinks || [],
      isAvailable: isAvailable !== false,
    };

    const profile = await prisma.creatorProfile.upsert({
      where: { userId: req.auth!.userId },
      create: { ...data, userId: req.auth!.userId },
      update: data,
    });

    res.json({ profile });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
```

- [ ] **Step 2: Register creators routes in server entry**

In `server/src/index.ts`, add the import after existing route imports:

```typescript
import creatorRoutes from "./routes/creators";
```

Add the route registration after existing `app.use` lines:

```typescript
app.use("/api/creators", creatorRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/creators.ts server/src/index.ts
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: add creator profile API routes"
```

---

## Task 5: Backend — Campaign Routes

**Files:**
- Create: `server/src/routes/campaigns.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create campaigns route file**

Create `server/src/routes/campaigns.ts`:

```typescript
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// POST /api/campaigns — Create campaign (merchant-only)
router.post("/", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId, creatorId, brief } = req.body;

    if (!productId || !creatorId || !brief) {
      res.status(400).json({ error: "productId, creatorId, and brief are required", code: "VALIDATION_ERROR" });
      return;
    }

    // Verify product belongs to merchant
    const product = await prisma.product.findFirst({
      where: { id: productId, userId: req.auth!.userId },
    });
    if (!product) {
      res.status(404).json({ error: "Product not found", code: "NOT_FOUND" });
      return;
    }

    // Verify creator exists and is available
    const creatorProfile = await prisma.creatorProfile.findUnique({
      where: { userId: creatorId },
    });
    if (!creatorProfile || !creatorProfile.isAvailable) {
      res.status(404).json({ error: "Creator not found or unavailable", code: "NOT_FOUND" });
      return;
    }

    // Create campaign + payment in a transaction
    const campaign = await prisma.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: {
          merchantId: req.auth!.userId,
          creatorId,
          productId,
          brief,
          amount: creatorProfile.rate,
          status: "PENDING",
        },
        include: {
          product: true,
          creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          payment: true,
        },
      });

      await tx.payment.create({
        data: {
          campaignId: c.id,
          amount: creatorProfile.rate,
          status: "HELD",
        },
      });

      return tx.campaign.findUnique({
        where: { id: c.id },
        include: {
          product: true,
          creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          payment: true,
        },
      });
    });

    res.status(201).json({ campaign });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/campaigns — List campaigns (both roles)
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, page = "1", limit = "20" } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * pageSize;

    const where: Record<string, unknown> = {};

    // Filter by role
    if (req.auth!.role === "MERCHANT") {
      where.merchantId = req.auth!.userId;
    } else {
      where.creatorId = req.auth!.userId;
    }

    if (status) {
      where.status = status;
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          product: true,
          creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          payment: true,
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    res.json({ data: campaigns, total, page: pageNum, pageSize });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// GET /api/campaigns/:id — Campaign detail (both roles)
router.get("/:id", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        product: true,
        creator: {
          select: {
            id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true,
            creatorProfile: true,
          },
        },
        merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
        payment: true,
      },
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }

    // Ensure user is part of this campaign
    if (campaign.merchantId !== req.auth!.userId && campaign.creatorId !== req.auth!.userId) {
      res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      return;
    }

    res.json({ campaign });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/accept — Creator accepts (PENDING → IN_PROGRESS)
router.patch("/:id/accept", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });

    if (!campaign || campaign.creatorId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }

    if (campaign.status !== "PENDING") {
      res.status(400).json({ error: "Campaign is not pending", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: "IN_PROGRESS" },
      include: {
        product: true,
        creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
        merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
        payment: true,
      },
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/decline — Creator declines (PENDING → DECLINED, refund payment)
router.patch("/:id/decline", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { payment: true },
    });

    if (!campaign || campaign.creatorId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }

    if (campaign.status !== "PENDING") {
      res.status(400).json({ error: "Campaign is not pending", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (campaign.payment) {
        await tx.payment.update({
          where: { id: campaign.payment.id },
          data: { status: "REFUNDED" },
        });
      }

      return tx.campaign.update({
        where: { id: req.params.id },
        data: { status: "DECLINED" },
        include: {
          product: true,
          creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          payment: true,
        },
      });
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/submit — Creator submits social links (IN_PROGRESS → SUBMITTED)
router.patch("/:id/submit", authenticate, requireRole("CREATOR"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { socialLinks } = req.body;

    if (!Array.isArray(socialLinks) || socialLinks.length === 0) {
      res.status(400).json({ error: "At least one social link is required", code: "VALIDATION_ERROR" });
      return;
    }

    for (const link of socialLinks) {
      if (!link.platform || !link.url) {
        res.status(400).json({ error: "Each social link needs a platform and url", code: "VALIDATION_ERROR" });
        return;
      }
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });

    if (!campaign || campaign.creatorId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }

    if (campaign.status !== "IN_PROGRESS") {
      res.status(400).json({ error: "Campaign is not in progress", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: "SUBMITTED", socialLinks },
      include: {
        product: true,
        creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
        merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
        payment: true,
      },
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/approve — Merchant approves (SUBMITTED → COMPLETED, release payment)
router.patch("/:id/approve", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { payment: true },
    });

    if (!campaign || campaign.merchantId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }

    if (campaign.status !== "SUBMITTED") {
      res.status(400).json({ error: "Campaign is not submitted", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (campaign.payment) {
        await tx.payment.update({
          where: { id: campaign.payment.id },
          data: { status: "RELEASED" },
        });
      }

      return tx.campaign.update({
        where: { id: req.params.id },
        data: { status: "COMPLETED" },
        include: {
          product: true,
          creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
          payment: true,
        },
      });
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// PATCH /api/campaigns/:id/revision — Merchant requests revision (SUBMITTED → IN_PROGRESS)
router.patch("/:id/revision", authenticate, requireRole("MERCHANT"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { revisionNote } = req.body;

    if (!revisionNote) {
      res.status(400).json({ error: "revisionNote is required", code: "VALIDATION_ERROR" });
      return;
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });

    if (!campaign || campaign.merchantId !== req.auth!.userId) {
      res.status(404).json({ error: "Campaign not found", code: "NOT_FOUND" });
      return;
    }

    if (campaign.status !== "SUBMITTED") {
      res.status(400).json({ error: "Campaign is not submitted", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: "IN_PROGRESS", revisionNote },
      include: {
        product: true,
        creator: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
        merchant: { select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true } },
        payment: true,
      },
    });

    res.json({ campaign: updated });
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
```

- [ ] **Step 2: Register campaigns routes in server entry**

In `server/src/index.ts`, add the import:

```typescript
import campaignRoutes from "./routes/campaigns";
```

Add the route registration:

```typescript
app.use("/api/campaigns", campaignRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/campaigns.ts server/src/index.ts
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: add campaign API routes with lifecycle management"
```

---

## Task 6: Backend — Dashboard Stats for Both Roles

**Files:**
- Modify: `server/src/routes/dashboard.ts`

- [ ] **Step 1: Update dashboard stats to be role-aware**

Replace the full contents of `server/src/routes/dashboard.ts`:

```typescript
import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();
const prisma = new PrismaClient();

// GET /api/dashboard/stats
router.get("/stats", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.auth!.userId;
    const role = req.auth!.role;

    if (role === "CREATOR") {
      // Creator dashboard stats
      const [activeCampaigns, completedCampaigns, pendingRequests, earnings, recentCampaigns] = await Promise.all([
        prisma.campaign.count({ where: { creatorId: userId, status: { in: ["IN_PROGRESS", "SUBMITTED"] } } }),
        prisma.campaign.count({ where: { creatorId: userId, status: "COMPLETED" } }),
        prisma.campaign.count({ where: { creatorId: userId, status: "PENDING" } }),
        prisma.payment.aggregate({
          where: { campaign: { creatorId: userId }, status: "RELEASED" },
          _sum: { amount: true },
        }),
        prisma.campaign.findMany({
          where: { creatorId: userId },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            product: { select: { title: true, images: true } },
            merchant: { select: { name: true } },
          },
        }),
      ]);

      res.json({
        activeCampaigns,
        completedCampaigns,
        pendingRequests,
        totalEarnings: earnings._sum.amount || 0,
        recentCampaigns: recentCampaigns.map((c) => ({
          id: c.id,
          productTitle: c.product.title,
          merchantName: c.merchant.name,
          status: c.status,
          amount: c.amount,
          createdAt: c.createdAt,
        })),
      });
    } else {
      // Merchant dashboard stats (existing + campaign count)
      const [totalProducts, activeProducts, draftProducts, archivedProducts, connectedMarketplaces, activeCampaigns, recentActivity] = await Promise.all([
        prisma.product.count({ where: { userId } }),
        prisma.product.count({ where: { userId, status: "ACTIVE" } }),
        prisma.product.count({ where: { userId, status: "DRAFT" } }),
        prisma.product.count({ where: { userId, status: "ARCHIVED" } }),
        prisma.marketplaceConnection.count({ where: { userId, status: "CONNECTED" } }),
        prisma.campaign.count({ where: { merchantId: userId, status: { notIn: ["COMPLETED", "DECLINED"] } } }),
        prisma.product.findMany({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: { title: true, createdAt: true, updatedAt: true },
        }),
      ]);

      res.json({
        totalProducts,
        activeProducts,
        draftProducts,
        archivedProducts,
        connectedMarketplaces,
        activeCampaigns,
        recentActivity: recentActivity.map((p) => ({
          type: p.createdAt.getTime() === p.updatedAt.getTime() ? "product_created" : "product_updated",
          title: p.title,
          timestamp: p.updatedAt,
        })),
      });
    }
  } catch {
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/dashboard.ts
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: add role-aware dashboard stats with campaign data"
```

---

## Task 7: Frontend — Auth Store & Shared UI Components

**Files:**
- Modify: `client/src/stores/authStore.ts`
- Create: `client/src/components/ui/tabs.tsx`
- Create: `client/src/components/ui/textarea.tsx`
- Create: `client/src/components/ui/switch.tsx`

- [ ] **Step 1: Update auth store to include role**

In `client/src/stores/authStore.ts`, update the `User` interface:

Change:
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
```
To:
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: "MERCHANT" | "CREATOR";
  createdAt: string;
  updatedAt: string;
}
```

Update the `signup` function signature in the `AuthState` interface:

Change:
```typescript
  signup: (name: string, email: string, password: string) => Promise<void>;
```
To:
```typescript
  signup: (name: string, email: string, password: string, role: string) => Promise<void>;
```

Update the `signup` implementation:

Change:
```typescript
  signup: async (name: string, email: string, password: string) => {
    const res = await api.post("/auth/signup", { name, email, password });
```
To:
```typescript
  signup: async (name: string, email: string, password: string, role: string) => {
    const res = await api.post("/auth/signup", { name, email, password, role });
```

- [ ] **Step 2: Add shadcn Tabs component**

```bash
cd "/Users/apple/Desktop/Tijar Flow/client" && npx shadcn@latest add tabs -y
```

If that doesn't work, create `client/src/components/ui/tabs.tsx` manually:

```typescript
import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-slate-100 p-1 text-slate-500",
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm",
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

- [ ] **Step 3: Add shadcn Textarea component**

```bash
cd "/Users/apple/Desktop/Tijar Flow/client" && npx shadcn@latest add textarea -y
```

If that doesn't work, create `client/src/components/ui/textarea.tsx` manually:

```typescript
import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
```

- [ ] **Step 4: Add shadcn Switch component**

```bash
cd "/Users/apple/Desktop/Tijar Flow/client" && npx shadcn@latest add switch -y
```

If that doesn't work, create `client/src/components/ui/switch.tsx` manually:

```typescript
import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-teal-600 data-[state=unchecked]:bg-slate-200",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }
```

- [ ] **Step 5: Commit**

```bash
git add client/src/stores/authStore.ts client/src/components/ui/tabs.tsx client/src/components/ui/textarea.tsx client/src/components/ui/switch.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: update auth store for roles and add UI components"
```

---

## Task 8: Frontend — Two-Step Signup Wizard

**Files:**
- Modify: `client/src/pages/Signup.tsx`

- [ ] **Step 1: Rewrite Signup.tsx as a two-step wizard**

Replace the full contents of `client/src/pages/Signup.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export function Signup() {
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<"MERCHANT" | "CREATOR" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleRoleSelect = (selectedRole: "MERCHANT" | "CREATOR") => {
    setRole(selectedRole);
    setStep(2);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!role) return;
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await signup(name, email, password, role);
      navigate("/");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Signup failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Card className="border-slate-200/60 shadow-xl shadow-slate-200/50">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-semibold text-slate-900">
            {step === 1 ? "I want to..." : "Create your account"}
          </CardTitle>
          <CardDescription className="text-slate-500">
            {step === 1
              ? "Choose how you'll use TijarFlow"
              : `Step 2 of 2 — ${role === "MERCHANT" ? "Merchant" : "Creator"} account`}
          </CardDescription>
          {/* Progress bar */}
          <div className="mt-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-600 rounded-full transition-all duration-300"
              style={{ width: step === 1 ? "50%" : "100%" }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleRoleSelect("MERCHANT")}
                className="w-full border-2 border-slate-200 rounded-xl p-5 flex items-center gap-4 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left"
              >
                <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                  🏪
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Sell & Advertise</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    I'm a store owner or merchant
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleRoleSelect("CREATOR")}
                className="w-full border-2 border-slate-200 rounded-xl p-5 flex items-center gap-4 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left"
              >
                <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                  🎬
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Promote & Earn</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    I'm a content creator
                  </p>
                </div>
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 -mt-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating account...
                    </span>
                  ) : (
                    "Create account"
                  )}
                </Button>
              </form>
            </>
          )}
          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="text-teal-600 font-medium hover:text-teal-700">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Signup.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: two-step signup wizard with role selection"
```

---

## Task 9: Frontend — Role-Based Routing, Sidebar, and ProtectedRoute

**Files:**
- Modify: `client/src/components/ProtectedRoute.tsx`
- Create: `client/src/components/layout/CreatorSidebar.tsx`
- Modify: `client/src/components/layout/Sidebar.tsx`
- Modify: `client/src/components/layout/AppLayout.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update ProtectedRoute to support role gating**

Replace the full contents of `client/src/components/ProtectedRoute.tsx`:

```tsx
import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function ProtectedRoute({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: "MERCHANT" | "CREATOR";
}) {
  const { isAuthenticated, isLoading, token, user, fetchUser } = useAuth();

  useEffect(() => {
    if (token && !isAuthenticated && isLoading) {
      fetchUser();
    }
  }, [token, isAuthenticated, isLoading, fetchUser]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role && user?.role !== role) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Create CreatorSidebar**

Create `client/src/components/layout/CreatorSidebar.tsx`:

```tsx
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Megaphone, UserCircle, Settings, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/profile", icon: UserCircle, label: "My Profile" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function CreatorSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-slate-300 flex flex-col z-50">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <img
          src="/White.jpeg"
          alt="TijarFlow"
          className="h-8 w-auto rounded"
        />
        <span className="ml-3 text-lg font-semibold text-white tracking-tight">
          TijarFlow
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-teal-500/15 text-teal-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-3 border-t border-slate-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors">
              <Avatar className="h-8 w-8 bg-teal-600 text-white">
                <AvatarFallback className="bg-teal-600 text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Update merchant Sidebar to include Advertising**

In `client/src/components/layout/Sidebar.tsx`, add the `Megaphone` import:

Change:
```typescript
import { LayoutDashboard, Package, Store, Settings, LogOut, ChevronDown } from "lucide-react";
```
To:
```typescript
import { LayoutDashboard, Package, Store, Megaphone, Settings, LogOut, ChevronDown } from "lucide-react";
```

Add "Advertising" to navItems:

Change:
```typescript
const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/products", icon: Package, label: "Products" },
  { to: "/marketplaces", icon: Store, label: "Marketplaces" },
  { to: "/settings", icon: Settings, label: "Settings" },
];
```
To:
```typescript
const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/products", icon: Package, label: "Products" },
  { to: "/marketplaces", icon: Store, label: "Marketplaces" },
  { to: "/advertising", icon: Megaphone, label: "Advertising" },
  { to: "/settings", icon: Settings, label: "Settings" },
];
```

- [ ] **Step 4: Update AppLayout to render role-based sidebar**

Replace the full contents of `client/src/components/layout/AppLayout.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { CreatorSidebar } from "./CreatorSidebar";
import { useAuth } from "@/hooks/useAuth";

export function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      {user?.role === "CREATOR" ? <CreatorSidebar /> : <Sidebar />}
      <main className="ml-64 p-8">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Update App.tsx with role-based routes**

Replace the full contents of `client/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { Dashboard } from "@/pages/Dashboard";
import { Products } from "@/pages/Products";
import { Marketplaces } from "@/pages/Marketplaces";
import { Settings } from "@/pages/Settings";
import { ShopifyGuide } from "@/pages/ShopifyGuide";
import { Advertising } from "@/pages/Advertising";
import { CreatorDashboard } from "@/pages/CreatorDashboard";
import { Campaigns } from "@/pages/Campaigns";
import { CreatorProfile } from "@/pages/CreatorProfile";
import { useAuth } from "@/hooks/useAuth";

function DashboardSwitch() {
  const { user } = useAuth();
  return user?.role === "CREATOR" ? <CreatorDashboard /> : <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Shared */}
          <Route path="/" element={<DashboardSwitch />} />
          <Route path="/settings" element={<Settings />} />

          {/* Merchant-only */}
          <Route path="/products" element={<ProtectedRoute role="MERCHANT"><Products /></ProtectedRoute>} />
          <Route path="/marketplaces" element={<ProtectedRoute role="MERCHANT"><Marketplaces /></ProtectedRoute>} />
          <Route path="/advertising" element={<ProtectedRoute role="MERCHANT"><Advertising /></ProtectedRoute>} />
          <Route path="/shopify-guide" element={<ProtectedRoute role="MERCHANT"><ShopifyGuide /></ProtectedRoute>} />

          {/* Creator-only */}
          <Route path="/campaigns" element={<ProtectedRoute role="CREATOR"><Campaigns /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute role="CREATOR"><CreatorProfile /></ProtectedRoute>} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Create placeholder pages so the app compiles**

Create minimal placeholder files. These will be fully implemented in later tasks.

Create `client/src/pages/Advertising.tsx`:

```tsx
export function Advertising() {
  return <div><h1 className="text-2xl font-semibold text-slate-900">Advertising</h1></div>;
}
```

Create `client/src/pages/CreatorDashboard.tsx`:

```tsx
export function CreatorDashboard() {
  return <div><h1 className="text-2xl font-semibold text-slate-900">Creator Dashboard</h1></div>;
}
```

Create `client/src/pages/Campaigns.tsx`:

```tsx
export function Campaigns() {
  return <div><h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1></div>;
}
```

Create `client/src/pages/CreatorProfile.tsx`:

```tsx
export function CreatorProfile() {
  return <div><h1 className="text-2xl font-semibold text-slate-900">My Profile</h1></div>;
}
```

- [ ] **Step 7: Verify the app compiles**

```bash
cd "/Users/apple/Desktop/Tijar Flow" && npm run dev
```

Check that both server and client start without errors. Visit `http://localhost:5173/signup` and confirm you see the two-step wizard.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/ProtectedRoute.tsx client/src/components/layout/CreatorSidebar.tsx client/src/components/layout/Sidebar.tsx client/src/components/layout/AppLayout.tsx client/src/App.tsx client/src/pages/Advertising.tsx client/src/pages/CreatorDashboard.tsx client/src/pages/Campaigns.tsx client/src/pages/CreatorProfile.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: role-based routing, sidebars, and placeholder pages"
```

---

## Task 10: Frontend — Creator Profile Page

**Files:**
- Modify: `client/src/pages/CreatorProfile.tsx` (replace placeholder)

- [ ] **Step 1: Implement the full creator profile page**

Replace the full contents of `client/src/pages/CreatorProfile.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import api from "@/lib/api";

const NICHES = ["Fashion", "Tech", "Food", "Lifestyle", "Beauty", "Sports", "Travel", "Education", "Entertainment", "Other"];
const PLATFORMS = ["instagram", "tiktok", "snapchat", "twitter", "youtube"];

interface SocialEntry {
  platform: string;
  handle: string;
  followerCount: number;
}

export function CreatorProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [niche, setNiche] = useState("");
  const [rate, setRate] = useState("");
  const [socialPlatforms, setSocialPlatforms] = useState<SocialEntry[]>([
    { platform: "instagram", handle: "", followerCount: 0 },
  ]);
  const [portfolioLinks, setPortfolioLinks] = useState<string[]>([]);
  const [isAvailable, setIsAvailable] = useState(true);

  const isComplete = displayName && niche && rate && socialPlatforms.some((s) => s.handle);

  useEffect(() => {
    api
      .get("/creators/profile")
      .then((res) => {
        const p = res.data.profile;
        if (p) {
          setDisplayName(p.displayName || "");
          setBio(p.bio || "");
          setProfilePhoto(p.profilePhoto || "");
          setNiche(p.niche || "");
          setRate(p.rate ? String(p.rate) : "");
          setSocialPlatforms(
            p.socialPlatforms?.length
              ? p.socialPlatforms
              : [{ platform: "instagram", handle: "", followerCount: 0 }]
          );
          setPortfolioLinks(p.portfolioLinks || []);
          setIsAvailable(p.isAvailable !== false);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/creators/profile", {
        displayName,
        bio: bio || null,
        profilePhoto: profilePhoto || null,
        niche,
        rate: parseFloat(rate),
        socialPlatforms: socialPlatforms.filter((s) => s.handle),
        portfolioLinks: portfolioLinks.filter(Boolean),
        isAvailable,
      });
      toast.success("Profile saved");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to save profile";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const addSocial = () => {
    setSocialPlatforms([...socialPlatforms, { platform: "instagram", handle: "", followerCount: 0 }]);
  };

  const removeSocial = (index: number) => {
    setSocialPlatforms(socialPlatforms.filter((_, i) => i !== index));
  };

  const updateSocial = (index: number, field: keyof SocialEntry, value: string | number) => {
    const updated = [...socialPlatforms];
    updated[index] = { ...updated[index], [field]: value };
    setSocialPlatforms(updated);
  };

  const addPortfolioLink = () => {
    setPortfolioLinks([...portfolioLinks, ""]);
  };

  const removePortfolioLink = (index: number) => {
    setPortfolioLinks(portfolioLinks.filter((_, i) => i !== index));
  };

  const updatePortfolioLink = (index: number, value: string) => {
    const updated = [...portfolioLinks];
    updated[index] = value;
    setPortfolioLinks(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">My Profile</h1>

      {!isComplete && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Complete your profile</p>
            <p className="text-sm text-amber-600 mt-0.5">
              Fill in your display name, niche, rate, and at least one social platform to appear in search results.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Basic Info */}
        <Card className="border-slate-200/60">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name *</Label>
              <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your public name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell merchants about yourself..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profilePhoto">Profile Photo URL</Label>
              <Input id="profilePhoto" value={profilePhoto} onChange={(e) => setProfilePhoto(e.target.value)} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Niche *</Label>
                <Select value={niche} onValueChange={setNiche}>
                  <SelectTrigger><SelectValue placeholder="Select niche" /></SelectTrigger>
                  <SelectContent>
                    {NICHES.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rate">Rate (SAR) *</Label>
                <Input id="rate" type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="500" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Social Platforms */}
        <Card className="border-slate-200/60">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Social Platforms *</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addSocial}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {socialPlatforms.map((sp, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="w-36">
                  <Label className="text-xs">Platform</Label>
                  <Select value={sp.platform} onValueChange={(v) => updateSocial(i, "platform", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Handle</Label>
                  <Input value={sp.handle} onChange={(e) => updateSocial(i, "handle", e.target.value)} placeholder="@username" />
                </div>
                <div className="w-28">
                  <Label className="text-xs">Followers</Label>
                  <Input type="number" min="0" value={sp.followerCount || ""} onChange={(e) => updateSocial(i, "followerCount", parseInt(e.target.value) || 0)} placeholder="10000" />
                </div>
                {socialPlatforms.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeSocial(i)} className="text-red-500 hover:text-red-700 px-2">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Portfolio */}
        <Card className="border-slate-200/60">
          <CardHeader className="pb-4 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Portfolio Links</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addPortfolioLink}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {portfolioLinks.length === 0 ? (
              <p className="text-sm text-slate-400">No portfolio links added yet.</p>
            ) : (
              portfolioLinks.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={link} onChange={(e) => updatePortfolioLink(i, e.target.value)} placeholder="https://..." className="flex-1" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removePortfolioLink(i)} className="text-red-500 hover:text-red-700 px-2">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Availability */}
        <Card className="border-slate-200/60">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">Available for campaigns</p>
                <p className="text-sm text-slate-500">When off, merchants won't see you in search results</p>
              </div>
              <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <Button
          onClick={handleSave}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
          disabled={saving}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            "Save Profile"
          )}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/CreatorProfile.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: creator profile page with social platforms and availability"
```

---

## Task 11: Frontend — Creator Dashboard

**Files:**
- Modify: `client/src/pages/CreatorDashboard.tsx` (replace placeholder)

- [ ] **Step 1: Implement the full creator dashboard**

Replace the full contents of `client/src/pages/CreatorDashboard.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, CheckCircle2, DollarSign, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { toast } from "sonner";

interface CreatorStats {
  activeCampaigns: number;
  completedCampaigns: number;
  pendingRequests: number;
  totalEarnings: number;
  recentCampaigns: {
    id: string;
    productTitle: string;
    merchantName: string;
    status: string;
    amount: number;
    createdAt: string;
  }[];
}

interface PendingCampaign {
  id: string;
  brief: string;
  amount: number;
  product: { title: string; images: string[] };
  merchant: { name: string };
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  REVISION_REQUESTED: "bg-orange-100 text-orange-700",
};

export function CreatorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [pendingCampaigns, setPendingCampaigns] = useState<PendingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = () => {
    Promise.all([
      api.get("/dashboard/stats"),
      api.get("/campaigns?status=PENDING&limit=10"),
    ])
      .then(([statsRes, pendingRes]) => {
        setStats(statsRes.data);
        setPendingCampaigns(pendingRes.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAccept = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      await api.patch(`/campaigns/${campaignId}/accept`);
      toast.success("Campaign accepted");
      fetchData();
    } catch {
      toast.error("Failed to accept campaign");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      await api.patch(`/campaigns/${campaignId}/decline`);
      toast.success("Campaign declined");
      fetchData();
    } catch {
      toast.error("Failed to decline campaign");
    } finally {
      setActionLoading(null);
    }
  };

  const statCards = [
    { label: "Active Campaigns", value: stats?.activeCampaigns ?? 0, icon: Megaphone, color: "text-blue-600 bg-blue-50" },
    { label: "Completed", value: stats?.completedCampaigns ?? 0, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
    { label: "Total Earnings", value: `${stats?.totalEarnings ?? 0} SAR`, icon: DollarSign, color: "text-teal-600 bg-teal-50" },
    { label: "Pending Requests", value: stats?.pendingRequests ?? 0, icon: Clock, color: "text-amber-600 bg-amber-50" },
  ];

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-slate-500 mt-1">Here's your campaign activity.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-slate-200/60">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{label}</p>
                  {loading ? (
                    <div className="h-8 w-16 bg-slate-100 rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
                  )}
                </div>
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending Requests */}
      <Card className="border-slate-200/60 mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900">New Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : pendingCampaigns.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No pending requests</p>
          ) : (
            <div className="space-y-3">
              {pendingCampaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{campaign.product.title}</p>
                    <p className="text-sm text-slate-500">
                      from {campaign.merchant.name} &middot; {campaign.amount} SAR
                    </p>
                    <p className="text-sm text-slate-400 mt-1 truncate">{campaign.brief}</p>
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    <Button
                      size="sm"
                      className="bg-teal-600 hover:bg-teal-700 text-white"
                      disabled={actionLoading === campaign.id}
                      onClick={() => handleAccept(campaign.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      disabled={actionLoading === campaign.id}
                      onClick={() => handleDecline(campaign.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Campaigns */}
      <Card className="border-slate-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900">Recent Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : stats?.recentCampaigns?.length ? (
            <div className="space-y-1">
              {stats.recentCampaigns.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate("/campaigns")}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">{c.productTitle}</p>
                    <p className="text-xs text-slate-400">{c.merchantName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={`text-xs font-normal ${statusColors[c.status] || ""}`}>
                      {c.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatTime(c.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center">No campaigns yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/CreatorDashboard.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: creator dashboard with stats, pending requests, and recent campaigns"
```

---

## Task 12: Frontend — Creator Campaigns Page

**Files:**
- Modify: `client/src/pages/Campaigns.tsx` (replace placeholder)

- [ ] **Step 1: Implement the full campaigns page**

Replace the full contents of `client/src/pages/Campaigns.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, AlertCircle, ExternalLink } from "lucide-react";
import api from "@/lib/api";

interface CampaignItem {
  id: string;
  status: string;
  brief: string;
  amount: number;
  socialLinks: { platform: string; url: string }[];
  revisionNote: string | null;
  product: { id: string; title: string; images: string[]; price: number; currency: string };
  merchant: { name: string; email: string };
  payment: { status: string } | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  REVISION_REQUESTED: "bg-orange-100 text-orange-700",
};

const PLATFORMS = ["instagram", "tiktok", "snapchat", "twitter", "youtube"];

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CampaignItem | null>(null);
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchCampaigns = () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (statusFilter !== "all") params.status = statusFilter;

    api
      .get("/campaigns", { params })
      .then((res) => {
        setCampaigns(res.data.data);
        setTotal(res.data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCampaigns();
  }, [page, statusFilter]);

  const openDetail = (campaign: CampaignItem) => {
    setSelected(campaign);
    setSocialLinks(
      campaign.socialLinks?.length
        ? campaign.socialLinks
        : [{ platform: "instagram", url: "" }]
    );
  };

  const handleSubmitLinks = async () => {
    if (!selected) return;
    const validLinks = socialLinks.filter((l) => l.url);
    if (validLinks.length === 0) {
      toast.error("Add at least one social link");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/campaigns/${selected.id}/submit`, { socialLinks: validLinks });
      toast.success("Links submitted for review");
      setSelected(null);
      fetchCampaigns();
    } catch {
      toast.error("Failed to submit links");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await api.patch(`/campaigns/${id}/accept`);
      toast.success("Campaign accepted");
      setSelected(null);
      fetchCampaigns();
    } catch {
      toast.error("Failed to accept");
    }
  };

  const handleDecline = async (id: string) => {
    try {
      await api.patch(`/campaigns/${id}/decline`);
      toast.success("Campaign declined");
      setSelected(null);
      fetchCampaigns();
    } catch {
      toast.error("Failed to decline");
    }
  };

  const totalPages = Math.ceil(total / 20);

  const tabFilters = [
    { value: "all", label: "All" },
    { value: "PENDING", label: "Pending" },
    { value: "IN_PROGRESS", label: "Active" },
    { value: "COMPLETED", label: "Completed" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Campaigns</h1>

      <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }} className="mb-4">
        <TabsList>
          {tabFilters.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="border-slate-200/60">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-slate-50 rounded animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400">No campaigns found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => openDetail(c)}
                  >
                    <TableCell className="font-medium">{c.product.title}</TableCell>
                    <TableCell>{c.merchant.name}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColors[c.status] || ""}`}>
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.amount} SAR</TableCell>
                    <TableCell className="text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Campaign Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.product.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Product info */}
                {(selected.product.images as string[])?.length > 0 && (
                  <img
                    src={(selected.product.images as string[])[0]}
                    alt={selected.product.title}
                    className="w-full h-48 object-cover rounded-lg"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}

                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">From: {selected.merchant.name}</span>
                  <Badge className={`text-xs ${statusColors[selected.status] || ""}`}>
                    {selected.status.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Brief</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{selected.brief}</p>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-semibold text-slate-900">{selected.amount} SAR</span>
                </div>

                {/* Revision note */}
                {selected.revisionNote && (
                  <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-orange-800">Revision Requested</p>
                      <p className="text-sm text-orange-600">{selected.revisionNote}</p>
                    </div>
                  </div>
                )}

                {/* Accept/Decline for PENDING */}
                {selected.status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-teal-600 hover:bg-teal-700 text-white" onClick={() => handleAccept(selected.id)}>
                      Accept
                    </Button>
                    <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDecline(selected.id)}>
                      Decline
                    </Button>
                  </div>
                )}

                {/* Submit social links for IN_PROGRESS */}
                {(selected.status === "IN_PROGRESS" || selected.status === "REVISION_REQUESTED") && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-slate-700">Social Media Links</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSocialLinks([...socialLinks, { platform: "instagram", url: "" }])}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {socialLinks.map((link, i) => (
                        <div key={i} className="flex gap-2">
                          <Select value={link.platform} onValueChange={(v) => {
                            const updated = [...socialLinks];
                            updated[i] = { ...updated[i], platform: v };
                            setSocialLinks(updated);
                          }}>
                            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PLATFORMS.map((p) => (
                                <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            className="flex-1"
                            placeholder="https://..."
                            value={link.url}
                            onChange={(e) => {
                              const updated = [...socialLinks];
                              updated[i] = { ...updated[i], url: e.target.value };
                              setSocialLinks(updated);
                            }}
                          />
                          {socialLinks.length > 1 && (
                            <Button variant="ghost" size="sm" className="text-red-500 px-2" onClick={() => {
                              setSocialLinks(socialLinks.filter((_, j) => j !== i));
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      className="w-full mt-3 bg-teal-600 hover:bg-teal-700 text-white"
                      disabled={submitting}
                      onClick={handleSubmitLinks}
                    >
                      {submitting ? "Submitting..." : "Submit Links for Review"}
                    </Button>
                  </div>
                )}

                {/* Show submitted links for SUBMITTED/COMPLETED */}
                {(selected.status === "SUBMITTED" || selected.status === "COMPLETED" || selected.status === "APPROVED") &&
                  selected.socialLinks?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Submitted Links</p>
                    <div className="space-y-2">
                      {selected.socialLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {link.platform}: {link.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Campaigns.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: creator campaigns page with detail view and link submission"
```

---

## Task 13: Frontend — Merchant Advertising Page

**Files:**
- Modify: `client/src/pages/Advertising.tsx` (replace placeholder)

- [ ] **Step 1: Implement the full advertising page**

Replace the full contents of `client/src/pages/Advertising.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ExternalLink, AlertCircle } from "lucide-react";
import api from "@/lib/api";

interface CampaignItem {
  id: string;
  status: string;
  brief: string;
  amount: number;
  socialLinks: { platform: string; url: string }[];
  revisionNote: string | null;
  product: { id: string; title: string; images: string[]; price: number };
  creator: { name: string; email: string };
  payment: { status: string } | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  REVISION_REQUESTED: "bg-orange-100 text-orange-700",
};

export function Advertising() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CampaignItem | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCampaigns = () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (statusFilter !== "all") params.status = statusFilter;

    api
      .get("/campaigns", { params })
      .then((res) => {
        setCampaigns(res.data.data);
        setTotal(res.data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCampaigns();
  }, [page, statusFilter]);

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.patch(`/campaigns/${selected.id}/approve`);
      toast.success("Campaign approved! Payment released.");
      setSelected(null);
      fetchCampaigns();
    } catch {
      toast.error("Failed to approve");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevision = async () => {
    if (!selected || !revisionNote.trim()) {
      toast.error("Please add a revision note");
      return;
    }
    setActionLoading(true);
    try {
      await api.patch(`/campaigns/${selected.id}/revision`, { revisionNote });
      toast.success("Revision requested");
      setSelected(null);
      setRevisionNote("");
      fetchCampaigns();
    } catch {
      toast.error("Failed to request revision");
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  const tabFilters = [
    { value: "all", label: "All" },
    { value: "IN_PROGRESS", label: "Active" },
    { value: "SUBMITTED", label: "Review" },
    { value: "COMPLETED", label: "Completed" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Advertising</h1>

      <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }} className="mb-4">
        <TabsList>
          {tabFilters.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="border-slate-200/60">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-slate-50 rounded animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-slate-400">No campaigns yet</p>
              <p className="text-sm text-slate-400 mt-1">Go to Products and click "Advertise" on a product to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Creator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => { setSelected(c); setRevisionNote(""); }}
                  >
                    <TableCell className="font-medium">{c.product.title}</TableCell>
                    <TableCell>{c.creator.name}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${statusColors[c.status] || ""}`}>
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.amount} SAR</TableCell>
                    <TableCell className="text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Campaign Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.product.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Creator: {selected.creator.name}</span>
                  <Badge className={`text-xs ${statusColors[selected.status] || ""}`}>
                    {selected.status.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Brief</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{selected.brief}</p>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-semibold text-slate-900">{selected.amount} SAR</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment</span>
                  <span className="font-medium">{selected.payment?.status || "—"}</span>
                </div>

                {/* Submitted links */}
                {selected.socialLinks?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Social Media Links</p>
                    <div className="space-y-2">
                      {selected.socialLinks.map((link, i) => (
                        <a
                          key={i}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {link.platform}: {link.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approve / Request Revision for SUBMITTED */}
                {selected.status === "SUBMITTED" && (
                  <div className="space-y-3 pt-2 border-t">
                    <Button
                      className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                      disabled={actionLoading}
                      onClick={handleApprove}
                    >
                      Approve & Release Payment
                    </Button>
                    <div>
                      <Textarea
                        placeholder="Describe what needs to change..."
                        value={revisionNote}
                        onChange={(e) => setRevisionNote(e.target.value)}
                        rows={2}
                      />
                      <Button
                        variant="outline"
                        className="w-full mt-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                        disabled={actionLoading}
                        onClick={handleRevision}
                      >
                        Request Revision
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Advertising.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: merchant advertising page with campaign management"
```

---

## Task 14: Frontend — Products Page "Advertise" Action + Browse Creators Dialog

**Files:**
- Modify: `client/src/pages/Products.tsx`

- [ ] **Step 1: Add Advertise action and creator browse dialog to Products.tsx**

At the top of `Products.tsx`, add the `Megaphone` import to the existing lucide-react import:

Add `Megaphone` to the destructured imports from `lucide-react`.

Add the `Textarea` import:

```typescript
import { Textarea } from "@/components/ui/textarea";
```

Add the `Select` imports (if not already imported):

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

Inside the `Products` component function, after existing state declarations, add:

```typescript
  // Advertise state
  const [advertiseProduct, setAdvertiseProduct] = useState<typeof products[0] | null>(null);
  const [creators, setCreators] = useState<any[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<any | null>(null);
  const [brief, setBrief] = useState("");
  const [nicheFilter, setNicheFilter] = useState("all");
  const [sendingRequest, setSendingRequest] = useState(false);

  const openAdvertise = (product: typeof products[0]) => {
    setAdvertiseProduct(product);
    setSelectedCreator(null);
    setBrief("");
    setNicheFilter("all");
    fetchCreators();
  };

  const fetchCreators = (niche?: string) => {
    setCreatorsLoading(true);
    const params: Record<string, string> = { limit: "50", sort: "followers" };
    if (niche && niche !== "all") params.niche = niche;
    api
      .get("/creators", { params })
      .then((res) => setCreators(res.data.data))
      .catch(() => {})
      .finally(() => setCreatorsLoading(false));
  };

  const handleSendRequest = async () => {
    if (!advertiseProduct || !selectedCreator || !brief.trim()) {
      toast.error("Please select a creator and write a brief");
      return;
    }
    setSendingRequest(true);
    try {
      await api.post("/campaigns", {
        productId: advertiseProduct.id,
        creatorId: selectedCreator.userId,
        brief,
      });
      toast.success("Campaign request sent!");
      setAdvertiseProduct(null);
      setSelectedCreator(null);
      setBrief("");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to send request";
      toast.error(message);
    } finally {
      setSendingRequest(false);
    }
  };
```

In the product row "..." dropdown menu (around line 778, after the "Push to" items separator and before the Delete item), add the "Advertise" option:

```tsx
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openAdvertise(product)}
                            className="cursor-pointer"
                          >
                            <Megaphone className="mr-2 h-4 w-4 text-teal-600" />
                            Advertise
                          </DropdownMenuItem>
```

At the end of the component's JSX (just before the closing `</div>` of the Products component), add the Advertise dialog:

```tsx
      {/* Advertise Dialog */}
      <Dialog open={!!advertiseProduct} onOpenChange={() => { setAdvertiseProduct(null); setSelectedCreator(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCreator ? "Send Campaign Request" : "Choose a Creator"}
            </DialogTitle>
            {advertiseProduct && (
              <p className="text-sm text-slate-500">For: {advertiseProduct.title}</p>
            )}
          </DialogHeader>

          {!selectedCreator ? (
            <div>
              {/* Filters */}
              <div className="flex gap-2 mb-4">
                <Select value={nicheFilter} onValueChange={(v) => { setNicheFilter(v); fetchCreators(v); }}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="All Niches" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Niches</SelectItem>
                    {["Fashion", "Tech", "Food", "Lifestyle", "Beauty", "Sports", "Travel", "Education", "Entertainment", "Other"].map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Creator Grid */}
              {creatorsLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-48 bg-slate-50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : creators.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No creators available</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {creators.map((creator) => {
                    const initials = creator.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
                    const maxFollowers = Math.max(0, ...(creator.socialPlatforms || []).map((s: { followerCount: number }) => s.followerCount));
                    const formatFollowers = (n: number) => n >= 1000 ? `${Math.floor(n / 1000)}K` : String(n);

                    return (
                      <div key={creator.id} className="border border-slate-200 rounded-xl p-4 text-center hover:border-teal-300 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 mx-auto mb-2 flex items-center justify-center text-white font-semibold">
                          {initials}
                        </div>
                        <p className="font-semibold text-slate-900 text-sm">{creator.displayName}</p>
                        <p className="text-xs text-teal-600">{creator.niche}</p>
                        <div className="flex justify-center gap-2 mt-2 text-xs text-slate-500">
                          {(creator.socialPlatforms || []).slice(0, 2).map((s: { platform: string; followerCount: number }, i: number) => (
                            <span key={i}>{s.platform === "instagram" ? "📸" : s.platform === "tiktok" ? "🎵" : s.platform === "youtube" ? "📺" : s.platform === "twitter" ? "🐦" : "📱"} {formatFollowers(s.followerCount)}</span>
                          ))}
                        </div>
                        <p className="font-semibold text-slate-900 text-sm mt-2">{creator.rate} SAR</p>
                        <Button
                          size="sm"
                          className="mt-2 w-full bg-teal-600 hover:bg-teal-700 text-white text-xs"
                          onClick={() => setSelectedCreator(creator)}
                        >
                          Select Creator
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedCreator(null)} className="text-slate-500 -ml-2">
                ← Back to creators
              </Button>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Product</p>
                  <p className="font-medium text-sm text-slate-900">{advertiseProduct?.title}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Creator</p>
                  <p className="font-medium text-sm text-slate-900">{selectedCreator.displayName}</p>
                  <p className="text-xs text-slate-500">{selectedCreator.niche}</p>
                </div>
              </div>

              <div className="flex justify-between items-center p-3 bg-teal-50 rounded-lg">
                <span className="text-sm text-teal-700">Campaign Cost</span>
                <span className="font-bold text-teal-700">{selectedCreator.rate} SAR</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Brief / Instructions</label>
                <Textarea
                  placeholder="Describe what you'd like the creator to highlight, any specific angles, hashtags, etc."
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={4}
                />
              </div>

              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                disabled={sendingRequest || !brief.trim()}
                onClick={handleSendRequest}
              >
                {sendingRequest ? "Sending..." : "Send Request & Pay"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Products.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: add Advertise action to product menu with creator browse dialog"
```

---

## Task 15: Frontend — Merchant Dashboard Campaign Stat

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add active campaigns stat card**

In `client/src/pages/Dashboard.tsx`, add `Megaphone` to the lucide-react imports:

```typescript
import { Package, ShoppingBag, Store, FileText, Clock, Megaphone } from "lucide-react";
```

Update the `DashboardStats` interface to include `activeCampaigns`:

```typescript
interface DashboardStats {
  totalProducts: number;
  activeProducts: number;
  draftProducts: number;
  archivedProducts: number;
  connectedMarketplaces: number;
  activeCampaigns: number;
  recentActivity: { type: string; title: string; timestamp: string }[];
}
```

Update the `statCards` array — add the campaigns card after the existing four:

Change the grid from `lg:grid-cols-4` to `lg:grid-cols-5`:

```typescript
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
```

Add the new stat card to the `statCards` array after the "Draft Products" entry:

```typescript
    {
      label: "Campaigns",
      value: stats?.activeCampaigns ?? 0,
      icon: Megaphone,
      color: "text-orange-600 bg-orange-50",
    },
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "feat: add active campaigns stat to merchant dashboard"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Start the dev servers**

```bash
cd "/Users/apple/Desktop/Tijar Flow" && npm run dev
```

- [ ] **Step 2: Verify compilation**

Check that both server and client compile without errors in the terminal output.

- [ ] **Step 3: Test signup flow**

1. Visit `http://localhost:5173/signup`
2. Verify two-step wizard: "I want to..." → role selection → form
3. Create a MERCHANT account
4. Verify merchant sidebar shows: Dashboard, Products, Marketplaces, Advertising, Settings
5. Log out
6. Create a CREATOR account
7. Verify creator sidebar shows: Dashboard, Campaigns, My Profile, Settings

- [ ] **Step 4: Test creator profile**

1. As creator, go to "My Profile"
2. Verify "Complete your profile" banner shows
3. Fill in display name, niche, rate, and a social platform
4. Save and verify success toast

- [ ] **Step 5: Test campaign creation**

1. Log in as merchant
2. Go to Products, click "..." on a product, click "Advertise"
3. Verify creator grid shows the creator from step 4
4. Select creator, write a brief, click "Send Request & Pay"
5. Go to Advertising page, verify campaign appears with PENDING status

- [ ] **Step 6: Test campaign lifecycle**

1. Log in as creator
2. Verify pending request shows on Dashboard
3. Accept the campaign
4. Go to Campaigns, click the campaign, add a social link, submit
5. Log in as merchant, go to Advertising, click the campaign
6. Verify social links are visible
7. Approve the campaign
8. Verify status changes to COMPLETED

- [ ] **Step 7: Commit any fixes**

If any fixes were needed during testing:

```bash
git add -A
git commit --author="Mehroz <mehroz.muneer@gmail.com>" -m "fix: address issues found during testing"
```
