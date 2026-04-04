# Creator & Advertising Feature — Design Spec

**Date:** 2026-04-02
**Status:** Approved
**Author:** Mehroz + Claude

---

## Overview

Add a two-sided marketplace feature to TijarFlow: merchants can hire content creators to advertise their products on social media. Creators get their own account type, dashboard, and campaign management. Payments use an escrow model (mock gateway for MVP).

---

## 1. User Roles & Authentication

### Role System
- `User` model gets a `role` field: `MERCHANT` (default) or `CREATOR`
- Role is set at signup, immutable for MVP
- JWT token includes role for backend route gating

### Signup Flow (Two-Step Wizard)
- **Step 1:** "I want to..." screen with two large buttons:
  - "Sell & Advertise" → MERCHANT
  - "Promote & Earn" → CREATOR
- **Step 2:** Standard signup form (name, email, password) with selected role sent to backend
- Progress bar showing "Step 1 of 2" / "Step 2 of 2"

### Login
- Unchanged — role is read from user record after login
- Frontend renders merchant or creator experience based on role

### Route Protection
- Merchant-only routes: `/products`, `/marketplaces`, `/advertising`, `/shopify-guide`
- Creator-only routes: `/campaigns`, `/profile`
- Shared routes: `/`, `/settings`
- Backend middleware validates role on role-specific API endpoints

---

## 2. Creator Profile

### New Model: `CreatorProfile`
One-to-one with User (where role=CREATOR):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | UUID | auto | Primary key |
| `userId` | UUID | yes | Unique, references User |
| `displayName` | String | yes | Public-facing name |
| `bio` | Text | no | Short description |
| `profilePhoto` | String | no | URL |
| `niche` | String | yes | Single select: Fashion, Tech, Food, Lifestyle, Beauty, Sports, Travel, Education, Entertainment, Other |
| `rate` | Decimal(10,2) | yes | Fixed price in SAR per campaign |
| `socialPlatforms` | JSON | yes | Array of `{ platform, handle, followerCount }` — at least one required |
| `portfolioLinks` | JSON | no | Array of URL strings |
| `isAvailable` | Boolean | yes | Default true. Controls visibility to merchants |
| `createdAt` | DateTime | auto | |
| `updatedAt` | DateTime | auto | |

**Social platform options:** instagram, tiktok, snapchat, twitter, youtube

### Profile Completeness
Creator must have `displayName`, `niche`, `rate`, and at least one social platform to appear in browse results. Incomplete profiles see a "Complete your profile" banner.

### Browse Creators API
- `GET /api/creators` — returns available creators with complete profiles
- Query params: `niche` (filter), `sort` (followers|rate), `page`, `limit`
- "Followers" sort uses the highest follower count across all platforms
- Returns: displayName, bio, profilePhoto, niche, rate, socialPlatforms, portfolioLinks, completed campaign count

---

## 3. Campaign System

### New Model: `Campaign`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `merchantId` | UUID | References User (merchant) |
| `creatorId` | UUID | References User (creator) |
| `productId` | UUID | References Product |
| `status` | Enum | See lifecycle below |
| `brief` | Text | Merchant's message/instructions |
| `amount` | Decimal(10,2) | SAR, copied from creator's rate at request time |
| `socialLinks` | JSON | Array of `{ platform, url }` — filled by creator |
| `revisionNote` | Text? | Merchant's feedback when requesting revision |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### Campaign Status Lifecycle

```
PENDING → ACCEPTED → IN_PROGRESS → SUBMITTED → APPROVED → COMPLETED
   ↓                                    ↓
DECLINED                         REVISION_REQUESTED → IN_PROGRESS (loop)
```

1. **PENDING** — Merchant sends request. Payment held in escrow.
2. **ACCEPTED** — Creator accepts. Immediately transitions to IN_PROGRESS.
3. **DECLINED** — Creator declines. Payment refunded.
4. **IN_PROGRESS** — Creator is working on the advertisement.
5. **SUBMITTED** — Creator pastes social media links and submits.
6. **APPROVED** — Merchant approves the submission. Payment released. Immediately transitions to COMPLETED.
7. **REVISION_REQUESTED** — Merchant requests changes with a note. Transitions back to IN_PROGRESS.
8. **COMPLETED** — Campaign done. Links visible to both sides. Payment settled.

### Campaign API Endpoints

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| POST | `/api/campaigns` | Merchant | Create campaign (productId, creatorId, brief). Amount auto-set from creator rate. Status → PENDING. |
| GET | `/api/campaigns` | Both | List campaigns. Merchants see theirs, creators see theirs. Filter by `status`. Paginated. |
| GET | `/api/campaigns/:id` | Both | Campaign detail with product, creator, and merchant info. |
| PATCH | `/api/campaigns/:id/accept` | Creator | Accept request. Status → IN_PROGRESS. |
| PATCH | `/api/campaigns/:id/decline` | Creator | Decline request. Status → DECLINED. Payment refunded. |
| PATCH | `/api/campaigns/:id/submit` | Creator | Submit social links. Status → SUBMITTED. |
| PATCH | `/api/campaigns/:id/approve` | Merchant | Approve submission. Status → COMPLETED. Payment released. |
| PATCH | `/api/campaigns/:id/revision` | Merchant | Request revision with note. Status → IN_PROGRESS. |

---

## 4. Payment System (Mock Escrow)

### New Model: `Payment`

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `campaignId` | UUID | Unique, references Campaign |
| `amount` | Decimal(10,2) | SAR |
| `status` | Enum | HELD, RELEASED, REFUNDED |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### Flow
- Campaign created → Payment created with status `HELD`
- Campaign approved → Payment status → `RELEASED`
- Campaign declined → Payment status → `REFUNDED`
- No real payment gateway for MVP — status tracking only. Gateway (Moyasar/Stripe) plugged in before launch.

---

## 5. Frontend — Merchant Side

### Sidebar Addition
- New "Advertising" item between Marketplaces and Settings

### Per-Product Advertise Action
- Product row "..." menu gets "Advertise" option
- Opens a dialog/modal:
  1. **Creator selection** — Card grid layout (2 columns). Each card: avatar (initials with gradient), name, niche, follower counts per platform, rate in SAR, "Select" button. Filter by niche dropdown, sort by followers/rate.
  2. **Request form** — After selecting creator: product summary, creator info, amount (creator's rate), text area for brief. "Send Request & Pay" button.

### Advertising Page (`/advertising`)
- Campaign table: product name, creator name, status badge (color-coded), amount, date
- Click row → detail view: product info, creator info, brief, submitted social links (if status ≥ SUBMITTED), action buttons (Approve / Request Revision when status = SUBMITTED)
- Status filter tabs: All, Active, Completed

### Dashboard Update
- Add "Active Campaigns" stat card to existing merchant dashboard

---

## 6. Frontend — Creator Side

### Creator Sidebar
- Dashboard, Campaigns, My Profile, Settings

### Creator Dashboard (`/`)
- **Stats cards:** Active Campaigns, Completed Campaigns, Total Earnings (SAR), Pending Requests
- **New Requests section:** Cards with product name, merchant name, amount, brief preview. Accept/Decline buttons per card.
- **Recent Campaigns list:** Product name, status badge, date

### Campaigns Page (`/campaigns`)
- Campaign table: product name, merchant name, status badge, amount, date
- Click row → detail view:
  - Product info with images
  - Merchant's brief
  - When IN_PROGRESS or REVISION_REQUESTED: form to add social links (platform dropdown + URL input, add more rows). Submit button.
  - When REVISION_REQUESTED: merchant's revision note displayed prominently
- Status filter tabs: All, Pending, Active, Completed

### My Profile Page (`/profile`)
- Edit form:
  - Display name (text input)
  - Bio (text area)
  - Profile photo (URL input)
  - Niche (dropdown)
  - Rate (number input, SAR)
  - Social platforms (repeatable rows: platform dropdown + handle input + follower count input, add/remove)
  - Portfolio links (repeatable URL inputs, add/remove)
  - Availability toggle
- "Complete your profile" banner if required fields missing

---

## 7. Routing & Role-Based Rendering

### App.tsx Changes
- After login, `user.role` determines which route set and sidebar renders
- Merchant: Dashboard, Products, Marketplaces, Advertising, Settings, ShopifyGuide
- Creator: Dashboard, Campaigns, My Profile, Settings

### ProtectedRoute Enhancement
- Accepts optional `role` prop
- Redirects to `/` if user's role doesn't match

### Auth Store Changes
- `User` interface adds `role: "MERCHANT" | "CREATOR"`
- `signup` function accepts `role` parameter
- `/auth/me` response includes role

---

## 8. Database Schema Changes Summary

### Modified Models
- **User:** Add `role` field (enum: MERCHANT, CREATOR, default MERCHANT)

### New Models
- **CreatorProfile:** One-to-one with User
- **Campaign:** References User (merchant), User (creator), Product
- **Payment:** One-to-one with Campaign

### New Enums
- `UserRole`: MERCHANT, CREATOR
- `CampaignStatus`: PENDING, ACCEPTED, DECLINED, IN_PROGRESS, SUBMITTED, REVISION_REQUESTED, APPROVED, COMPLETED
- `PaymentStatus`: HELD, RELEASED, REFUNDED
