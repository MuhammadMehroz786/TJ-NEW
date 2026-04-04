import { useEffect, useState } from "react";
import { Package, ShoppingBag, Store, FileText, Clock, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";

interface DashboardStats {
  totalProducts: number;
  activeProducts: number;
  draftProducts: number;
  archivedProducts: number;
  connectedMarketplaces: number;
  activeCampaigns: number;
  recentActivity: { type: string; title: string; timestamp: string }[];
}

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    {
      label: "Total Products",
      value: stats?.totalProducts ?? 0,
      icon: Package,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Active Products",
      value: stats?.activeProducts ?? 0,
      icon: ShoppingBag,
      color: "text-teal-600 bg-teal-50",
    },
    {
      label: "Marketplaces",
      value: stats?.connectedMarketplaces ?? 0,
      icon: Store,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "Draft Products",
      value: stats?.draftProducts ?? 0,
      icon: FileText,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "Campaigns",
      value: stats?.activeCampaigns ?? 0,
      icon: Megaphone,
      color: "text-orange-600 bg-orange-50",
    },
  ];

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-slate-500 mt-1">
          Here's what's happening with your products today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-slate-200/60">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{label}</p>
                  {loading ? (
                    <div className="h-8 w-16 bg-slate-100 rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
                  )}
                </div>
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <Card className="border-slate-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-400" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : stats?.recentActivity?.length ? (
            <div className="space-y-1">
              {stats.recentActivity.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        activity.type === "product_created" ? "bg-teal-500" : "bg-blue-500"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{activity.title}</p>
                      <p className="text-xs text-slate-400">
                        {activity.type === "product_created" ? "Created" : "Updated"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs font-normal text-slate-500">
                    {formatTime(activity.timestamp)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No activity yet</p>
              <p className="text-slate-400 text-xs mt-1">
                Connect a marketplace and sync products to get started
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
