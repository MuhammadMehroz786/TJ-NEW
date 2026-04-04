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
import { PromoCodes } from "@/pages/PromoCodes";
import { AffiliateLinks } from "@/pages/AffiliateLinks";
import { ManualSales } from "@/pages/ManualSales";
import { ProductMarketplace } from "@/pages/ProductMarketplace";
import { useAuth } from "@/hooks/useAuth";

function DashboardSwitch() {
  const { user } = useAuth();
  return user?.role === "CREATOR" ? <CreatorDashboard /> : <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardSwitch />} />
          <Route path="/settings" element={<Settings />} />

          {/* Merchant-only */}
          <Route path="/products" element={<ProtectedRoute role="MERCHANT"><Products /></ProtectedRoute>} />
          <Route path="/marketplaces" element={<ProtectedRoute role="MERCHANT"><Marketplaces /></ProtectedRoute>} />
          <Route path="/advertising" element={<ProtectedRoute role="MERCHANT"><Advertising /></ProtectedRoute>} />
          <Route path="/promo-codes" element={<ProtectedRoute role="MERCHANT"><PromoCodes /></ProtectedRoute>} />
          <Route path="/sales" element={<ProtectedRoute role="MERCHANT"><ManualSales /></ProtectedRoute>} />
          <Route path="/shopify-guide" element={<ProtectedRoute role="MERCHANT"><ShopifyGuide /></ProtectedRoute>} />

          {/* Creator-only */}
          <Route path="/campaigns" element={<ProtectedRoute role="CREATOR"><Campaigns /></ProtectedRoute>} />
          <Route path="/browse-products" element={<ProtectedRoute role="CREATOR"><ProductMarketplace /></ProtectedRoute>} />
          <Route path="/affiliate-links" element={<ProtectedRoute role="CREATOR"><AffiliateLinks /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute role="CREATOR"><CreatorProfile /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}
