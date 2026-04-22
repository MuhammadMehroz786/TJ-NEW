import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Megaphone, UserCircle, Settings, LogOut, ChevronDown, Link2, ShoppingBag, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSidebarState } from "./sidebarState";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/browse-products", icon: ShoppingBag, label: "Browse Products" },
  { to: "/campaigns", icon: Megaphone, label: "Campaigns" },
  { to: "/affiliate-links", icon: Link2, label: "Affiliate Links" },
  { to: "/profile", icon: UserCircle, label: "My Profile" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function CreatorSidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { collapsed, setCollapsed, mobileOpen } = useSidebarState();
  const isRtl = i18n.language?.startsWith("ar");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  const sideClass = isRtl
    ? `right-0 ${mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}`
    : `left-0  ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`;
  const widthClass = collapsed ? "w-16" : "w-64";
  const CollapseIcon = (collapsed !== !!isRtl) ? ChevronsRight : ChevronsLeft;

  return (
    <aside
      className={`fixed top-0 bottom-0 z-50 bg-slate-900 text-slate-300 flex flex-col transition-[transform,width] duration-200 ease-out ${sideClass} ${widthClass}`}
    >
      <div className="h-16 flex items-center px-3 border-b border-slate-800 overflow-hidden">
        {collapsed ? (
          <img src="/logo-dark.png" alt="TijarFlow" className="h-7 w-auto mx-auto" />
        ) : (
          <img src="/logo-dark.png" alt="TijarFlow" className="h-8 w-auto ms-2" />
        )}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? "justify-center" : "gap-3"} px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive ? "bg-teal-500/15 text-teal-400" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

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
                <AvatarFallback className="bg-teal-600 text-white text-xs font-semibold">{initials}</AvatarFallback>
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
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
              <LogOut className="me-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
