import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { CreatorSidebar } from "./CreatorSidebar";
import { useAuth } from "@/hooks/useAuth";

export function AppLayout() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      {user?.role === "CREATOR" ? <CreatorSidebar /> : <Sidebar />}
      <main className="ml-64 min-h-screen">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
