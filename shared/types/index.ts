// Enums
export enum Platform {
  SALLA = "SALLA",
  SHOPIFY = "SHOPIFY",
}

export enum ConnectionStatus {
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  PENDING = "PENDING",
}

export enum ProductStatus {
  ACTIVE = "ACTIVE",
  DRAFT = "DRAFT",
  ARCHIVED = "ARCHIVED",
}

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

// Interfaces
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceConnection {
  id: string;
  userId: string;
  platform: Platform;
  storeName: string;
  storeUrl: string;
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  userId: string;
  marketplaceConnectionId: string | null;
  title: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  barcode: string | null;
  currency: string;
  quantity: number;
  images: string[];
  category: string | null;
  tags: string[];
  status: ProductStatus;
  platformProductId: string | null;
  platformData: Record<string, unknown> | null;
  marketplaceConnection?: MarketplaceConnection;
  createdAt: string;
  updatedAt: string;
}

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

export interface ApiError {
  error: string;
  code: "VALIDATION_ERROR" | "UNAUTHORIZED" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardStats {
  totalProducts: number;
  activeProducts: number;
  draftProducts: number;
  archivedProducts: number;
  connectedMarketplaces: number;
  recentActivity: {
    type: string;
    title: string;
    timestamp: string;
  }[];
}

export interface AuthResponse {
  token: string;
  user: User;
}
