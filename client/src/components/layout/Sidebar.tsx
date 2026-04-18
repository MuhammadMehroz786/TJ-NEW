import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, Store, Megaphone, Settings, LogOut, ChevronDown, Tag, CreditCard, Sparkles, Wallet, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const merchantNav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/products", icon: Package, label: "Products" },
  { to: "/marketplaces", icon: Store, label: "Marketplaces" },
  { to: "/advertising", icon: Megaphone, label: "Advertising" },
  { to: "/promo-codes", icon: Tag, label: "Promo Codes" },
  { to: "/sales", icon: CreditCard, label: "Sales Attribution" },
  { to: "/ai-studio", icon: Sparkles, label: "AI Studio" },
  { to: "/billing", icon: Wallet, label: "Credits & Billing" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const adminNav = [
  { to: "/admin", icon: ShieldCheck, label: "Admin" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-slate-900 text-slate-300 flex flex-col z-50">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <img
          src="/White.jpeg"
          alt="TijarFlow"
          className="h-8 w-auto rounded"
        />
        <span className="ml-3 text-lg font-semibold text-white tracking-tight">
          TijarFlow
        </span>
      </div>

      {/* Navigation */}
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

      {/* User Section */}
      <div className="p-3 border-t border-slate-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors">
              <Avatar className="h-8 w-8 bg-teal-600 text-white">
                <AvatarFallback className="bg-teal-600 text-white text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {user?.name}
                </p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
