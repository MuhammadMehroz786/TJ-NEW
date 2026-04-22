import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { CreatorSidebar } from "./CreatorSidebar";
import { TopBar } from "./TopBar";
import { SidebarCtx, SIDEBAR_COLLAPSED_KEY } from "./sidebarState";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

export function AppLayout() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const location = useLocation();

  // Collapsed state persists across reloads. Mobile drawer does NOT persist
  // — it would be confusing if the drawer was open on every page load.
  const [collapsed, setCollapsedRaw] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const setCollapsed = (v: boolean) => {
    setCollapsedRaw(v);
    try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? "1" : "0"); } catch { /* */ }
  };

  // Auto-close the mobile drawer whenever the route changes — otherwise a
  // nav click leaves the drawer covering the page we just navigated to.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // When the drawer is open on mobile, prevent the body from scrolling
  // behind it.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (mobileOpen) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  // Margin applied to <main> so content lines up with the visible sidebar
  // on desktop. Mobile hides the sidebar off-screen, so margin is 0.
  //  - Full sidebar = 256px (w-64)
  //  - Collapsed rail = 64px (w-16)
  const desktopSidebarWidth = collapsed ? "lg:ms-16" : "lg:ms-64";

  return (
    <SidebarCtx.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      <div className="min-h-screen bg-slate-50">
        {/* Scrim — only on mobile when drawer is open */}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          />
        )}

        {user?.role === "CREATOR" ? <CreatorSidebar /> : <Sidebar />}

        <main
          className={`min-h-screen flex flex-col transition-[margin] duration-200 ms-0 ${desktopSidebarWidth}`}
          // isRtl is driven by the <html dir> attribute; ms-*/me-* Tailwind
          // utilities already respect it, so no extra class flip is needed.
          dir={isRtl ? "rtl" : "ltr"}
        >
          <TopBar />
          <div className="p-4 sm:p-6 lg:p-8 flex-1">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarCtx.Provider>
  );
}
