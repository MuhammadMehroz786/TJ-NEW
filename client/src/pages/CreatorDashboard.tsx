import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, CheckCircle2, DollarSign, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { toast } from "sonner";

interface CreatorStats {
  activeCampaigns: number;
  completedCampaigns: number;
  pendingRequests: number;
  totalEarnings: number;
  recentCampaigns: {
    id: string;
    productTitle: string;
    merchantName: string;
    status: string;
    amount: number;
    createdAt: string;
  }[];
}

interface PendingCampaign {
  id: string;
  brief: string;
  amount: number;
  product: { title: string; images: string[] };
  merchant: { name: string };
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  REVISION_REQUESTED: "bg-orange-100 text-orange-700",
};

export function CreatorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<CreatorStats | null>(null);
  const [pendingCampaigns, setPendingCampaigns] = useState<PendingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = () => {
    Promise.all([
      api.get("/dashboard/stats"),
      api.get("/campaigns?status=PENDING&limit=10"),
    ])
      .then(([statsRes, pendingRes]) => {
        setStats(statsRes.data);
        setPendingCampaigns(pendingRes.data.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleAccept = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      await api.patch(`/campaigns/${campaignId}/accept`);
      toast.success("Campaign accepted");
      fetchData();
    } catch { toast.error("Failed to accept campaign"); }
    finally { setActionLoading(null); }
  };

  const handleDecline = async (campaignId: string) => {
    setActionLoading(campaignId);
    try {
      await api.patch(`/campaigns/${campaignId}/decline`);
      toast.success("Campaign declined");
      fetchData();
    } catch { toast.error("Failed to decline campaign"); }
    finally { setActionLoading(null); }
  };

  const statCards = [
    { label: "Active Campaigns", value: stats?.activeCampaigns ?? 0, icon: Megaphone, color: "text-blue-600 bg-blue-50" },
    { label: "Completed", value: stats?.completedCampaigns ?? 0, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
    { label: "Total Earnings", value: `${stats?.totalEarnings ?? 0} SAR`, icon: DollarSign, color: "text-teal-600 bg-teal-50" },
    { label: "Pending Requests", value: stats?.pendingRequests ?? 0, icon: Clock, color: "text-amber-600 bg-amber-50" },
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
        <h1 className="text-2xl font-semibold text-slate-900">Welcome back, {user?.name?.split(" ")[0]}</h1>
        <p className="text-slate-500 mt-1">Here's your campaign activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

      <Card className="border-slate-200/60 mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900">New Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 bg-slate-50 rounded-lg animate-pulse" />)}</div>
          ) : pendingCampaigns.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No pending requests</p>
          ) : (
            <div className="space-y-3">
              {pendingCampaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{campaign.product.title}</p>
                    <p className="text-sm text-slate-500">from {campaign.merchant.name} &middot; {campaign.amount} SAR</p>
                    <p className="text-sm text-slate-400 mt-1 truncate">{campaign.brief}</p>
                  </div>
                  <div className="flex gap-2 ml-4 shrink-0">
                    <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" disabled={actionLoading === campaign.id} onClick={() => handleAccept(campaign.id)}>Accept</Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={actionLoading === campaign.id} onClick={() => handleDecline(campaign.id)}>Decline</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900">Recent Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}</div>
          ) : stats?.recentCampaigns?.length ? (
            <div className="space-y-1">
              {stats.recentCampaigns.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigate("/campaigns")}>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{c.productTitle}</p>
                    <p className="text-xs text-slate-400">{c.merchantName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={`text-xs font-normal ${statusColors[c.status] || ""}`}>{c.status.replace(/_/g, " ")}</Badge>
                    <span className="text-xs text-slate-400">{formatTime(c.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 py-4 text-center">No campaigns yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
