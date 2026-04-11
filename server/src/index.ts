import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
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

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = ["http://localhost:5173", "http://46.101.101.241"];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use("/media", express.static(path.resolve(process.cwd(), "storage")));

// Routes
app.use("/api/auth", authRoutes);
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
app.use("/api/ai-studio", aiStudioRoutes);
app.use("/api/whatsapp", whatsappRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
