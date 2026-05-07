import { useEffect, useState } from "react";
import { Package, ShoppingBag, Store, FileText, Clock, Megaphone, MessageCircle, Sparkles, Send, Image as ImageIcon, ArrowRight, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface DashboardStats {
  totalProducts: number;
  activeProducts: number;
  draftProducts: number;
  archivedProducts: number;
  connectedMarketplaces: number;
  activeCampaigns: number;
  recentActivity: { type: string; title: string; timestamp: string }[];
}

interface WhatsAppInfo {
  phoneNumber: string;
  waLink: string;
}

export function Dashboard() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [waInfo, setWaInfo] = useState<WhatsAppInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then((res) => setStats(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
    api
      .get("/dashboard/whatsapp-info")
      .then((res) => setWaInfo(res.data))
      .catch(() => {});
  }, []);

  const copyNumber = () => {
    if (!waInfo?.phoneNumber) return;
    navigator.clipboard.writeText(waInfo.phoneNumber);
    setCopied(true);
    toast.success(t("dashboard.wa.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const statCards = [
    { label: t("dashboard.stats.totalProducts"), value: stats?.totalProducts ?? 0, icon: Package, color: "text-blue-600 bg-blue-50" },
    { label: t("dashboard.stats.activeProducts"), value: stats?.activeProducts ?? 0, icon: ShoppingBag, color: "text-teal-600 bg-teal-50" },
    { label: t("dashboard.stats.marketplaces"), value: stats?.connectedMarketplaces ?? 0, icon: Store, color: "text-purple-600 bg-purple-50" },
    { label: t("dashboard.stats.draftProducts"), value: stats?.draftProducts ?? 0, icon: FileText, color: "text-amber-600 bg-amber-50" },
    { label: t("dashboard.stats.campaigns"), value: stats?.activeCampaigns ?? 0, icon: Megaphone, color: "text-orange-600 bg-orange-50" },
  ];

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("dashboard.timeJustNow");
    if (mins < 60) return t("dashboard.timeMinutes", { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("dashboard.timeHours", { n: hours });
    return t("dashboard.timeDays", { n: Math.floor(hours / 24) });
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t("dashboard.welcome", { name: user?.name?.split(" ")[0] ?? "" })}
        </h1>
        <p className="text-slate-500 mt-1">
          {t("dashboard.subtitle")}
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

      {/* WhatsApp Bot */}
      {waInfo?.waLink && (
        <Card className="border-slate-200/60 mb-8 overflow-hidden">
          <div
            className="relative"
            style={{
              background:
                "linear-gradient(135deg, #075E54 0%, #128C7E 50%, #25D366 100%)",
            }}
          >
            {/* Subtle pattern overlay */}
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
            <div className="relative grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 lg:p-8">
              {/* Left: QR + number + button */}
              <div className="lg:col-span-2 flex flex-col items-center justify-center text-center">
                <div className="bg-white p-3 rounded-2xl shadow-xl">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(waInfo.waLink)}`}
                    alt={t("dashboard.wa.qrAlt")}
                    width={180}
                    height={180}
                    className="block"
                  />
                </div>
                <p className="text-white/90 text-xs font-medium mt-3 mb-1 uppercase tracking-wider">
                  {t("dashboard.wa.scanLabel")}
                </p>
                <button
                  onClick={copyNumber}
                  className="group flex items-center gap-2 text-white text-lg font-bold hover:text-white/80 transition-colors"
                  title={t("dashboard.wa.copyTitle")}
                >
                  <span dir="ltr">{waInfo.phoneNumber}</span>
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4 opacity-60 group-hover:opacity-100" />
                  )}
                </button>
                <a
                  href={waInfo.waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 bg-white text-[#128C7E] px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                >
                  <MessageCircle className="h-4 w-4" />
                  {t("dashboard.wa.openButton")}
                  {i18n.language === "ar" ? null : <ArrowRight className="h-4 w-4" />}
                </a>
              </div>

              {/* Right: heading + steps */}
              <div className="lg:col-span-3 text-white">
                <div className="flex items-center gap-2 mb-1">
                  <div className="bg-white/20 backdrop-blur p-1.5 rounded-lg">
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-white/80">
                    {t("dashboard.wa.kicker")}
                  </span>
                </div>
                <h2 className="text-2xl lg:text-3xl font-bold mb-2 leading-tight">
                  {t("dashboard.wa.heading")}
                </h2>
                <p className="text-white/80 text-sm mb-5 leading-relaxed max-w-md">
                  {t("dashboard.wa.subheading")}
                </p>

                <div className="space-y-3">
                  {[
                    { icon: Send, key: "step1" },
                    { icon: ImageIcon, key: "step2" },
                    { icon: Sparkles, key: "step3" },
                  ].map(({ icon: Icon, key }, i) => (
                    <div key={key} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-xs font-bold text-white border border-white/30">
                        {i + 1}
                      </div>
                      <div className="flex-1 pt-0.5">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Icon className="h-3.5 w-3.5 text-white/70" />
                          <p className="text-sm font-semibold text-white">
                            {t(`dashboard.wa.${key}.title`)}
                          </p>
                        </div>
                        <p className="text-xs text-white/70 leading-relaxed">
                          {t(`dashboard.wa.${key}.desc`)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Recent Activity */}
      <Card className="border-slate-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-400" />
            {t("dashboard.recentActivity")}
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
              <p className="text-slate-500 text-sm">{t("dashboard.noActivity")}</p>
              <p className="text-slate-400 text-xs mt-1">
                {t("dashboard.noActivityHint")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
