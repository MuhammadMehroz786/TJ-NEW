// Salla OAuth routes removed — Salla now uses per-merchant client credentials.
// Connections are created via POST /api/marketplaces/connect with clientId + clientSecret.
import { Router } from "express";
const router = Router();
export default router;
