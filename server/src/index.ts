import dotenv from "dotenv";
dotenv.config();


// Fail fast on missing secrets — never let the server boot with forgeable tokens.
const requiredEnvAtStart = ["JWT_SECRET", "TOKEN_ENCRYPTION_KEY", "DATABASE_URL"];
for (const name of requiredEnvAtStart) {
  if (!process.env[name]) {
    console.error(`[startup] Missing required env var: ${name}`);
    process.exit(1);
  }
}

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import path from "path";
import authRoutes from "./routes/auth";
import productRoutes from "./routes/products";
import marketplaceRoutes from "./routes/marketplaces";
import userRoutes from "./routes/user";
import dashboardRoutes from "./routes/dashboard";
import creatorRoutes from "./routes/creators";
import campaignRoutes from "./routes/campaigns";
import promoCodeRoutes from "./routes/promoCodes";
import affiliateLinkRoutes from "./routes/affiliateLinks";
import manualSaleRoutes from "./routes/manualSales";
import marketplaceProductRoutes from "./routes/marketplace";
import aiStudioRoutes from "./routes/aiStudio";
import whatsappRoutes from "./routes/whatsapp";
import creditsRoutes from "./routes/credits";
import sallaRoutes from "./routes/salla";

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  "http://localhost:5173",
  "https://app.tijarflow.com",
];
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Webhook routes need the raw request body for HMAC signature verification —
// register these BEFORE express.json() so the bytes aren't parsed+restringified.
app.use("/api/credits/webhook", express.raw({ type: "application/json" }));
app.use("/api/whatsapp/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "50mb" }));

// Media serving — signed URLs required (see server/src/lib/mediaSign.ts)
import { verifyMediaSig } from "./lib/mediaSign";
app.use("/media", (req, res, next) => {
  const sig = typeof req.query.sig === "string" ? req.query.sig : null;
  if (!sig || !verifyMediaSig(`/media${req.path}`, sig)) {
    res.status(403).json({ error: "Invalid or expired media URL" });
    return;
  }
  next();
}, express.static(path.resolve(process.cwd(), "storage")));

// Rate limits — sensitive endpoints only. Keyed by IP. Adjust as traffic grows.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  limit: 20,                 // 20 auth attempts per IP per window
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many auth requests, try again later", code: "RATE_LIMITED" },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 min
  limit: 10,            // 10 AI calls per minute per IP (still gated by credits)
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, slow down", code: "RATE_LIMITED" },
});
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many checkout attempts", code: "RATE_LIMITED" },
});

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/marketplaces", marketplaceRoutes);
app.use("/api/user", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/creators", creatorRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/promo-codes", promoCodeRoutes);
app.use("/api/affiliate-links", affiliateLinkRoutes);
app.use("/api/manual-sales", manualSaleRoutes);
app.use("/api/marketplace", marketplaceProductRoutes);
app.use("/api/ai-studio", aiLimiter, aiStudioRoutes);
app.use("/api/whatsapp", whatsappRoutes);
// Checkout limiter on the mutating credits endpoint. Webhook + balance reads
// bypass this limiter because they mount /api/credits first at raw-body above,
// but we apply the limiter for POST to /checkout specifically via path.
app.use("/api/credits/checkout", checkoutLimiter);
app.use("/api/credits", creditsRoutes);
app.use("/api/salla", sallaRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
