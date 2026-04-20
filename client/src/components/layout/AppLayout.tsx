import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { CreatorSidebar } from "./CreatorSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

export function AppLayout() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");

  return (
    <div className="min-h-screen bg-slate-50">
      {user?.role === "CREATOR" ? <CreatorSidebar /> : <Sidebar />}
      <main className={`${isRtl ? "mr-64" : "ml-64"} min-h-screen`}>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
