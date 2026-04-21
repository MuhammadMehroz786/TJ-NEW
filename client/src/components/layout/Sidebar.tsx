import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, Store, Megaphone, Settings, LogOut, ChevronDown, Tag, CreditCard, Sparkles, Wallet, ShieldCheck } from "lucide-react";
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

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const merchantNav = [
    { to: "/", icon: LayoutDashboard, label: t("nav.dashboard") },
    { to: "/products", icon: Package, label: t("nav.products") },
    { to: "/marketplaces", icon: Store, label: t("nav.marketplaces") },
    { to: "/advertising", icon: Megaphone, label: t("nav.advertising") },
    { to: "/promo-codes", icon: Tag, label: t("nav.promoCodes") },
    { to: "/sales", icon: CreditCard, label: t("nav.sales") },
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

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  // Sidebar flips to the right side in RTL via `dir` inherited from <html>.
  // Using `start`/`end` Tailwind utils would be ideal but we keep explicit
  // positioning here for simplicity.
  const sidebarSide = currentLang === "ar" ? "right-0" : "left-0";

  return (
    <aside className={`fixed ${sidebarSide} top-0 bottom-0 w-64 bg-slate-900 text-slate-300 flex flex-col z-50`}>
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <img src="/White.jpeg" alt="TijarFlow" className="h-8 w-auto rounded" />
        <span className="ms-3 text-lg font-semibold text-white tracking-tight">TijarFlow</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {(user?.role === "ADMIN" ? adminNav : merchantNav).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-teal-500/15 text-teal-400"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors">
              <Avatar className="h-8 w-8 bg-teal-600 text-white">
                <AvatarFallback className="bg-teal-600 text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-start min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
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
