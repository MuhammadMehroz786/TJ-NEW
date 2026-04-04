import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "50mb" }));

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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
