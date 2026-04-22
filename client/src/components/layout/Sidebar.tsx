import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, Store, Settings, LogOut, ChevronDown, Sparkles, Wallet, ShieldCheck, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { SupportedLang } from "@/i18n";
import { useSidebarState } from "./sidebarState";

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { collapsed, setCollapsed, mobileOpen } = useSidebarState();

  // MVP scope: Advertising / Promo Codes / Sales Attribution are hidden
  // from navigation. Routes + endpoints are kept in place so nothing breaks
  // for any existing bookmarks or future work — just removed from the menu.
  const merchantNav = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/products", icon: Package, label: t("nav.products") },
    { to: "/marketplaces", icon: Store, label: t("nav.marketplaces") },
    { to: "/ai-studio", icon: Sparkles, label: t("nav.aiStudio") },
    { to: "/billing", icon: Wallet, label: t("nav.billing") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  const adminNav = [
    { to: "/admin", icon: ShieldCheck, label: t("nav.admin") },
    { to: "/settings", icon: Settings, label: t("nav.settings") },
  ];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const currentLang = (i18n.language?.slice(0, 2) || "en") as SupportedLang;
  const isRtl = currentLang === "ar";

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  // Positioning strategy per breakpoint:
  //  - Mobile (< lg): off-canvas, slide in when mobileOpen
  //  - Desktop (lg+): always visible, toggles between w-64 (full) and w-16 (rail)
  // Side (left vs right) flips in Arabic.
  const sideClass = isRtl
    ? `right-0 ${mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`
    : `left-0  ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`;
  const widthClass = collapsed ? "w-16" : "w-64";

  // Arrow direction for the collapse toggle depends on language + state:
  // think of it as "point toward where clicking will move things".
  const CollapseIcon = (collapsed !== isRtl) ? ChevronsRight : ChevronsLeft;

  return (
    <aside
      className={`fixed top-0 bottom-0 z-50 bg-slate-900 text-slate-300 flex flex-col transition-[transform,width] duration-200 ease-out ${sideClass} ${widthClass}`}
    >
      {/* Header: logo, flex shrinks to icon-only when collapsed */}
      <div className="h-16 flex items-center px-3 border-b border-slate-800 overflow-hidden">
        {collapsed ? (
          <img src="/logo-dark.png" alt="TijarFlow" className="h-7 w-auto mx-auto" />
        ) : (
          <img src="/logo-dark.png" alt="TijarFlow" className="h-8 w-auto ms-2" />
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {(user?.role === "ADMIN" ? adminNav : merchantNav).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-teal-500/15 text-teal-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Desktop-only collapse toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        className="hidden lg:flex items-center justify-center h-9 mx-2 mb-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
      >
        <CollapseIcon className="h-4 w-4" />
      </button>

      <div className="p-2 border-t border-slate-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={collapsed ? (user?.name || "Account") : undefined}
              className={`flex items-center ${collapsed ? "justify-center" : "gap-3"} w-full px-2 py-2 rounded-lg hover:bg-slate-800 transition-colors`}
            >
              <Avatar className="h-8 w-8 bg-teal-600 text-white shrink-0">
                <AvatarFallback className="bg-teal-600 text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex-1 text-start min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
              <LogOut className="me-2 h-4 w-4" />
              {t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
