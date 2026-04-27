import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, DollarSign, Sparkles, MessageCircle, Search, ShieldCheck, Wallet, ArrowUpRight, Activity, TrendingUp, Server, Gauge, Ticket, Plus, Copy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api from "@/lib/api";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface Overview {
  users: { total: number; merchants: number; creators: number; newLast24h: number; newLast7d: number };
  revenue: { totalUsd: number; totalCreditsSold: number; thisMonthUsd: number; completedPurchases: number; pendingPurchases: number };
  aiStudio: { totalEnhancements: number; enhancementsLast7d: number };
  whatsapp: { totalSessions: number; verifiedSessions: number };
}

interface ActiveUsers { dau: number; wau: number; mau: number; }

interface TimeseriesPoint { day: string; signups: number; enhancements: number; revenue: number; creditsSold: number; }
interface TopUser { id: string; email: string; name: string; role: string; enhancements: number; revenueUsd: number; creditsBought: number; }
interface Funnel { signed: number; enhanced: number; purchased: number; waLinked: number; enhancedRate: number; purchasedRate: number; waLinkedRate: number; }
interface WaStats { total: number; verified: number; guest: number; exhausted: number; activeLast24h: number; byState: { state: string; count: number }[]; }
interface SystemHealth { uptimeSeconds: number; memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number }; db: { connections: number }; nodeVersion: string; }

interface UserRow {
  id: string; email: string; name: string; role: "MERCHANT" | "CREATOR" | "ADMIN";
  aiCredits: number; purchasedCredits: number; createdAt: string;
}

interface AiCreditCode {
  id: string;
  code: string;
  credits: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  redemptionCount: number;
}

interface UserDetail {
  user: UserRow & { aiCreditsWeekKey: string; _count: { whatsappSessions: number; creditPurchases: number } };
  purchases: { id: string; credits: number; amount: string | number; status: string; createdAt: string; stripeSessionId: string }[];
  whatsappSessions: { id: string; phoneNumber: string; isVerified: boolean; state: string; creditsUsed: number; creditsLimit: number; lastMessageAt: string }[];
  imageCount: number;
  productCount: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const fmtUsd = (n: number | string) => `$${Number(n).toFixed(2)}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
const fmtDayLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

const TEAL = "#0D9488";
const INDIGO = "#6366F1";
const PURPLE = "#A855F7";
const AMBER = "#F59E0B";
const SLATE = "#64748B";

// ──────────────────────────────────────────────────────────────────────────────
// Small card components
// ──────────────────────────────────────────────────────────────────────────────
function Stat({ icon: Icon, label, value, sub, color = "slate" }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string | number; sub?: string; color?: "teal" | "slate" | "indigo" | "amber";
}) {
  const colorMap = {
    slate: "bg-slate-50 text-slate-600",
    teal: "bg-teal-50 text-teal-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <Card className="border-slate-200">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
          <div className={`h-8 w-8 rounded-md flex items-center justify-center ${colorMap[color]}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="border-b border-slate-200 flex items-center gap-0">
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 -mb-px ${
              active === t.id ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────────
export function Admin() {
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "revenue" | "activity" | "whatsapp" | "codes" | "system">("overview");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [active, setActive] = useState<ActiveUsers | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [waStats, setWaStats] = useState<WaStats | null>(null);
  const [sys, setSys] = useState<SystemHealth | null>(null);

  const [seriesDays, setSeriesDays] = useState(30);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Users list (Users tab)
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);

  // User detail dialog
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [grantAmount, setGrantAmount] = useState("50");
  const [grantNote, setGrantNote] = useState("");
  const [granting, setGranting] = useState(false);

  // AI Codes tab
  const [codes, setCodes] = useState<AiCreditCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codeForm, setCodeForm] = useState({ code: "", credits: "100", maxRedemptions: "", expiresAt: "", note: "" });
  const [creatingCode, setCreatingCode] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [o, a, t, tu, f, w, s] = await Promise.all([
        api.get("/admin/overview"),
        api.get("/admin/active-users"),
        api.get(`/admin/timeseries?days=${seriesDays}`),
        api.get("/admin/top-users?limit=10"),
        api.get("/admin/funnel"),
        api.get("/admin/whatsapp-stats"),
        api.get("/admin/system-health"),
      ]);
      setOverview(o.data);
      setActive(a.data);
      setSeries(t.data.series);
      setTopUsers(tu.data.data);
      setFunnel(f.data);
      setWaStats(w.data);
      setSys(s.data);
    } catch {
      toast.error("Failed to load admin data");
    }
  }, [seriesDays]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh every 30s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => loadAll(), 30000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadAll]);

  // Users tab loading
  const loadUsers = useCallback(() => {
    setUsersLoading(true);
    const params: Record<string, string | number> = { page, pageSize: 25 };
    if (search) params.search = search;
    if (roleFilter !== "all") params.role = roleFilter;
    api.get("/admin/users", { params })
      .then((r) => { setUsers(r.data.data); setUserTotal(r.data.total); })
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setUsersLoading(false));
  }, [page, search, roleFilter]);
  useEffect(() => { if (activeTab === "users") loadUsers(); }, [activeTab, loadUsers]);

  const openDetail = async (userId: string) => {
    setDetailLoading(true);
    try {
      const r = await api.get(`/admin/users/${userId}`);
      setDetail(r.data);
    } catch {
      toast.error("Failed to load user");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGrant = async () => {
    if (!detail) return;
    const credits = parseInt(grantAmount, 10);
    if (!Number.isInteger(credits) || credits <= 0) return toast.error("Enter a positive number of credits");
    setGranting(true);
    try {
      const r = await api.post(`/admin/users/${detail.user.id}/grant-credits`, { credits, note: grantNote });
      toast.success(`Granted ${r.data.granted} credits`);
      setGrantAmount("50"); setGrantNote("");
      await openDetail(detail.user.id);
      loadAll();
      if (activeTab === "users") loadUsers();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to grant credits");
    } finally {
      setGranting(false);
    }
  };

  // ── AI Codes tab handlers ────────────────────────────────────────────────
  const loadCodes = useCallback(() => {
    setCodesLoading(true);
    api.get("/admin/ai-credit-codes")
      .then((r) => setCodes(r.data.data))
      .catch(() => toast.error("Failed to load codes"))
      .finally(() => setCodesLoading(false));
  }, []);
  useEffect(() => { if (activeTab === "codes") loadCodes(); }, [activeTab, loadCodes]);

  const generateCode = () => {
    // 8-char alpha-num, easy to read aloud
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    setCodeForm((f) => ({ ...f, code: s }));
  };

  const submitCreateCode = async () => {
    const code = codeForm.code.trim().toUpperCase();
    const credits = parseInt(codeForm.credits, 10);
    if (!code || code.length < 3) return toast.error("Code must be at least 3 characters");
    if (!/^[A-Z0-9_-]+$/.test(code)) return toast.error("Code can only contain A-Z, 0-9, _ and -");
    if (!Number.isInteger(credits) || credits < 1) return toast.error("Credits must be a positive integer");
    setCreatingCode(true);
    try {
      const payload: Record<string, unknown> = { code, credits };
      if (codeForm.maxRedemptions) payload.maxRedemptions = parseInt(codeForm.maxRedemptions, 10);
      if (codeForm.expiresAt) payload.expiresAt = new Date(codeForm.expiresAt).toISOString();
      if (codeForm.note.trim()) payload.note = codeForm.note.trim();
      await api.post("/admin/ai-credit-codes", payload);
      toast.success(`Code ${code} created`);
      setCodeForm({ code: "", credits: "100", maxRedemptions: "", expiresAt: "", note: "" });
      loadCodes();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to create code");
    } finally {
      setCreatingCode(false);
    }
  };

  const toggleCodeActive = async (id: string, isActive: boolean) => {
    try {
      await api.patch(`/admin/ai-credit-codes/${id}`, { isActive });
      loadCodes();
    } catch {
      toast.error("Failed to update code");
    }
  };

  const handleRoleChange = async (newRole: "MERCHANT" | "CREATOR" | "ADMIN") => {
    if (!detail) return;
    try {
      await api.patch(`/admin/users/${detail.user.id}/role`, { role: newRole });
      toast.success(`Role → ${newRole}`);
      await openDetail(detail.user.id);
      loadUsers();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to change role");
    }
  };

  const seriesWithLabel = useMemo(() => series.map((p) => ({ ...p, label: fmtDayLabel(p.day) })), [series]);
  const totalPages = Math.max(1, Math.ceil(userTotal / 25));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-teal-600" />
            Admin
          </h1>
          <p className="text-slate-500 text-sm mt-1">System overview, analytics, and user management</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-teal-600" />
            Auto-refresh (30s)
          </label>
          <Button variant="outline" size="sm" onClick={loadAll}>Refresh</Button>
        </div>
      </div>

      <Tabs
        active={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: "overview", label: "Overview", icon: Gauge },
          { id: "users", label: "Users", icon: Users },
          { id: "revenue", label: "Revenue", icon: DollarSign },
          { id: "activity", label: "Activity", icon: Activity },
          { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
          { id: "codes", label: "AI Codes", icon: Ticket },
          { id: "system", label: "System", icon: Server },
        ]}
      />

      {/* ══════════ OVERVIEW TAB ══════════ */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {overview && active && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat icon={Users} label="Total Users" value={overview.users.total} sub={`+${overview.users.newLast24h} last 24h · +${overview.users.newLast7d} last 7d`} color="indigo" />
              <Stat icon={Activity} label="Active Now (DAU)" value={active.dau} sub={`WAU ${active.wau} · MAU ${active.mau}`} color="teal" />
              <Stat icon={DollarSign} label="Revenue" value={fmtUsd(overview.revenue.totalUsd)} sub={`${fmtUsd(overview.revenue.thisMonthUsd)} this month`} color="amber" />
              <Stat icon={Sparkles} label="Enhancements" value={overview.aiStudio.totalEnhancements.toLocaleString()} sub={`${overview.aiStudio.enhancementsLast7d} in last 7 days`} color="teal" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Timeseries: daily enhancements + signups */}
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">Daily activity</h3>
                  <Select value={String(seriesDays)} onValueChange={(v) => setSeriesDays(Number(v))}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={seriesWithLabel}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="enhancements" stroke={TEAL} strokeWidth={2} dot={false} name="Enhancements" />
                    <Line type="monotone" dataKey="signups" stroke={INDIGO} strokeWidth={2} dot={false} name="Signups" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Funnel */}
            {funnel && (
              <Card className="border-slate-200">
                <CardContent className="p-5">
                  <h3 className="font-semibold text-slate-900 mb-4">Conversion funnel</h3>
                  <div className="space-y-3">
                    {[
                      { label: "Signed up", count: funnel.signed, pct: 1, color: INDIGO },
                      { label: "Enhanced ≥1 image", count: funnel.enhanced, pct: funnel.enhancedRate, color: TEAL },
                      { label: "Made a purchase", count: funnel.purchased, pct: funnel.purchasedRate, color: AMBER },
                      { label: "Linked WhatsApp", count: funnel.waLinked, pct: funnel.waLinkedRate, color: PURPLE },
                    ].map((step) => (
                      <div key={step.label}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-slate-700">{step.label}</span>
                          <span className="font-semibold text-slate-900">{step.count} <span className="text-xs text-slate-400 font-normal">{fmtPct(step.pct)}</span></span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${step.pct * 100}%`, background: step.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Top users */}
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-slate-500" />Top users by activity</h3>
                <span className="text-xs text-slate-400">{topUsers.length} users</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="pb-2 font-semibold">User</th>
                    <th className="pb-2 font-semibold">Role</th>
                    <th className="pb-2 font-semibold text-right">Enhancements</th>
                    <th className="pb-2 font-semibold text-right">Credits Bought</th>
                    <th className="pb-2 font-semibold text-right">Revenue</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map((u) => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="py-2.5">
                        <div className="font-medium text-slate-900">{u.email}</div>
                        <div className="text-xs text-slate-500">{u.name}</div>
                      </td>
                      <td className="py-2.5">
                        <Badge variant="secondary" className={u.role === "MERCHANT" ? "bg-teal-100 text-teal-700" : "bg-indigo-100 text-indigo-700"}>{u.role}</Badge>
                      </td>
                      <td className="py-2.5 text-right font-semibold">{u.enhancements}</td>
                      <td className="py-2.5 text-right">{u.creditsBought}</td>
                      <td className="py-2.5 text-right text-teal-700 font-semibold">{fmtUsd(u.revenueUsd)}</td>
                      <td className="py-2.5 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(u.id)} className="h-7 px-2"><ArrowUpRight className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════ USERS TAB ══════════ */}
      {activeTab === "users" && (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <div className="relative max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Search email or name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-10" />
              </div>
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="MERCHANT">Merchants</SelectItem>
                  <SelectItem value="CREATOR">Creators</SelectItem>
                  <SelectItem value="ADMIN">Admins</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-slate-500 ml-auto">{userTotal.toLocaleString()} total</span>
            </div>
            {usersLoading ? (
              <div className="p-8 text-center text-sm text-slate-400">Loading...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">No users match</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                      <th className="px-4 py-2.5 font-semibold">Email</th>
                      <th className="px-4 py-2.5 font-semibold">Name</th>
                      <th className="px-4 py-2.5 font-semibold">Role</th>
                      <th className="px-4 py-2.5 font-semibold">Credits</th>
                      <th className="px-4 py-2.5 font-semibold">Joined</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <td className="px-4 py-3 font-medium text-slate-900">{u.email}</td>
                        <td className="px-4 py-3 text-slate-600">{u.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className={u.role === "ADMIN" ? "bg-purple-100 text-purple-700" : u.role === "MERCHANT" ? "bg-teal-100 text-teal-700" : "bg-indigo-100 text-indigo-700"}>{u.role}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{u.aiCredits} <span className="text-slate-400">+{u.purchasedCredits}</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => openDetail(u.id)} className="h-7 px-2"><ArrowUpRight className="h-3.5 w-3.5" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Page {page} of {totalPages}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ══════════ REVENUE TAB ══════════ */}
      {activeTab === "revenue" && overview && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={DollarSign} label="Total Revenue" value={fmtUsd(overview.revenue.totalUsd)} color="amber" />
            <Stat icon={DollarSign} label="This Month" value={fmtUsd(overview.revenue.thisMonthUsd)} color="teal" />
            <Stat icon={Wallet} label="Credits Sold" value={overview.revenue.totalCreditsSold.toLocaleString()} sub={`${overview.revenue.completedPurchases} purchases`} color="indigo" />
            <Stat icon={Activity} label="Pending Purchases" value={overview.revenue.pendingPurchases} sub="awaiting payment" color="slate" />
          </div>
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Daily revenue — last {seriesDays} days</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={seriesWithLabel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: "#e2e8f0" }} formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                  <Bar dataKey="revenue" fill={AMBER} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Daily credits sold</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={seriesWithLabel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="creditsSold" fill={INDIGO} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════ ACTIVITY TAB ══════════ */}
      {activeTab === "activity" && (
        <div className="space-y-5">
          {active && (
            <div className="grid grid-cols-3 gap-4">
              <Stat icon={Activity} label="DAU" value={active.dau} sub="Daily active users" color="teal" />
              <Stat icon={Activity} label="WAU" value={active.wau} sub="Weekly active users" color="indigo" />
              <Stat icon={Activity} label="MAU" value={active.mau} sub="Monthly active users" color="amber" />
            </div>
          )}
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">Enhancements per day</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={seriesWithLabel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="enhancements" fill={TEAL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <h3 className="font-semibold text-slate-900 mb-4">New signups per day</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={seriesWithLabel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Line type="monotone" dataKey="signups" stroke={INDIGO} strokeWidth={2} dot={{ fill: INDIGO, r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════ WHATSAPP TAB ══════════ */}
      {activeTab === "whatsapp" && waStats && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={MessageCircle} label="Total Sessions" value={waStats.total} color="indigo" />
            <Stat icon={ShieldCheck} label="Verified" value={waStats.verified} sub={`${waStats.guest} guest`} color="teal" />
            <Stat icon={Activity} label="Active Last 24h" value={waStats.activeLast24h} color="amber" />
            <Stat icon={Gauge} label="Exhausted" value={waStats.exhausted} sub="used all free credits" color="slate" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <h3 className="font-semibold text-slate-900 mb-4">Sessions by state</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={waStats.byState} dataKey="count" nameKey="state" cx="50%" cy="50%" outerRadius={90} label={({ state, count }) => `${state} (${count})`}>
                      {waStats.byState.map((_, i) => <Cell key={i} fill={[TEAL, INDIGO, PURPLE, AMBER, SLATE][i % 5]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-5">
                <h3 className="font-semibold text-slate-900 mb-4">Verified vs Guest</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={[{ name: "Verified", value: waStats.verified }, { name: "Guest", value: waStats.guest }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                      <Cell fill={TEAL} />
                      <Cell fill={SLATE} />
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════ SYSTEM TAB ══════════ */}
      {/* ══════════ AI CODES TAB ══════════ */}
      {activeTab === "codes" && (
        <div className="space-y-5">
          {/* Create new code */}
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-teal-600" /> Create AI credit code
                </h3>
                <p className="text-xs text-slate-500">Merchants redeem on the Billing page</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Code</label>
                  <div className="flex gap-1">
                    <Input
                      value={codeForm.code}
                      onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value.toUpperCase() })}
                      placeholder="LAUNCH50"
                      maxLength={40}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={generateCode} title="Generate random code">
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Credits</label>
                  <Input
                    type="number" min={1} max={100000}
                    value={codeForm.credits}
                    onChange={(e) => setCodeForm({ ...codeForm, credits: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Max uses</label>
                  <Input
                    type="number" min={1}
                    placeholder="∞"
                    value={codeForm.maxRedemptions}
                    onChange={(e) => setCodeForm({ ...codeForm, maxRedemptions: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Expires</label>
                  <Input
                    type="date"
                    value={codeForm.expiresAt}
                    onChange={(e) => setCodeForm({ ...codeForm, expiresAt: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={submitCreateCode} disabled={creatingCode} className="bg-teal-600 hover:bg-teal-700 text-white w-full">
                    {creatingCode ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <label className="text-xs font-medium text-slate-600 mb-1 block">Note (internal, optional)</label>
                <Input
                  value={codeForm.note}
                  onChange={(e) => setCodeForm({ ...codeForm, note: e.target.value })}
                  placeholder="e.g. Ashhad QA testing"
                  maxLength={200}
                />
              </div>
            </CardContent>
          </Card>

          {/* List */}
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">All codes</h3>
                <span className="text-xs text-slate-400">{codes.length} total</span>
              </div>
              {codesLoading ? (
                <div className="p-8 text-center text-sm text-slate-400">Loading...</div>
              ) : codes.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">No codes yet — create one above.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-400 uppercase tracking-wide">
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-5">Code</th>
                      <th className="text-left">Credits</th>
                      <th className="text-left">Used</th>
                      <th className="text-left">Expires</th>
                      <th className="text-left">Note</th>
                      <th className="text-left">Status</th>
                      <th className="text-right pr-5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((c) => {
                      const usedOut = c.maxRedemptions !== null && c.redemptionCount >= c.maxRedemptions;
                      const expired = c.expiresAt !== null && new Date(c.expiresAt).getTime() < Date.now();
                      return (
                        <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                          <td className="py-2.5 px-5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-slate-900">{c.code}</span>
                              <button
                                onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied"); }}
                                title="Copy"
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="text-slate-700">{c.credits}</td>
                          <td className="text-slate-500">
                            {c.redemptionCount}{c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ""}
                          </td>
                          <td className="text-slate-500 text-xs">
                            {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="text-slate-500 text-xs max-w-[200px] truncate" title={c.note || ""}>
                            {c.note || "—"}
                          </td>
                          <td>
                            {!c.isActive ? (
                              <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">Disabled</Badge>
                            ) : expired ? (
                              <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">Expired</Badge>
                            ) : usedOut ? (
                              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Used up</Badge>
                            ) : (
                              <Badge className="text-xs bg-emerald-100 text-emerald-700">Active</Badge>
                            )}
                          </td>
                          <td className="text-right pr-5">
                            <Button
                              size="sm" variant="outline"
                              onClick={() => toggleCodeActive(c.id, !c.isActive)}
                            >
                              {c.isActive ? "Disable" : "Enable"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "system" && sys && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat icon={Server} label="Uptime" value={fmtUptime(sys.uptimeSeconds)} color="teal" />
            <Stat icon={Gauge} label="Memory (RSS)" value={`${sys.memory.rssMb} MB`} sub={`heap ${sys.memory.heapUsedMb}/${sys.memory.heapTotalMb} MB`} color="indigo" />
            <Stat icon={Activity} label="DB Connections" value={sys.db.connections} color="amber" />
            <Stat icon={Server} label="Node" value={sys.nodeVersion} color="slate" />
          </div>
          <Card className="border-slate-200">
            <CardContent className="p-5 text-sm text-slate-600">
              <h3 className="font-semibold text-slate-900 mb-3">Environment</h3>
              <p>Server is running in production mode behind nginx with signed-URL media serving, Stripe webhook, WhatsApp HMAC verification, and rate limiting on auth/AI/checkout endpoints.</p>
              <p className="mt-2 text-xs text-slate-400">For detailed logs, SSH into the VPS and run <code className="bg-slate-100 px-1.5 py-0.5 rounded">pm2 logs tijarflow-api</code>.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════ USER DETAIL DIALOG ══════════ */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>User Details</DialogTitle></DialogHeader>
          {detailLoading || !detail ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading...</div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Identity</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">Email</span><p className="font-medium text-slate-900">{detail.user.email}</p></div>
                  <div><span className="text-slate-500">Name</span><p className="font-medium text-slate-900">{detail.user.name}</p></div>
                  <div><span className="text-slate-500">User ID</span><p className="font-mono text-xs text-slate-600">{detail.user.id}</p></div>
                  <div><span className="text-slate-500">Joined</span><p className="text-slate-900">{new Date(detail.user.createdAt).toLocaleString()}</p></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Role & Credits</p>
                <div className="flex items-center gap-3">
                  <Select value={detail.user.role} onValueChange={(v) => handleRoleChange(v as "MERCHANT" | "CREATOR" | "ADMIN")}>
                    <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MERCHANT">MERCHANT</SelectItem>
                      <SelectItem value="CREATOR">CREATOR</SelectItem>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1 flex items-center gap-4 text-sm">
                    <span><Wallet className="h-3.5 w-3.5 inline mr-1 text-slate-400" /> Monthly: <span className="font-semibold">{detail.user.aiCredits}</span></span>
                    <span>Purchased: <span className="font-semibold">{detail.user.purchasedCredits}</span></span>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-100">
                <p className="text-xs font-semibold text-teal-800 mb-2">Grant credits (manual)</p>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={10000} value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} className="w-24" />
                  <Input placeholder="Note (optional)" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} className="flex-1" />
                  <Button onClick={handleGrant} disabled={granting} className="bg-teal-600 hover:bg-teal-700 text-white">{granting ? "Granting..." : "Grant"}</Button>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Activity</p>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div><span className="text-slate-500">Images</span><p className="font-semibold text-slate-900">{detail.imageCount}</p></div>
                  <div><span className="text-slate-500">Products</span><p className="font-semibold text-slate-900">{detail.productCount}</p></div>
                  <div><span className="text-slate-500">Purchases</span><p className="font-semibold text-slate-900">{detail.user._count.creditPurchases}</p></div>
                  <div><span className="text-slate-500">WhatsApp</span><p className="font-semibold text-slate-900">{detail.user._count.whatsappSessions}</p></div>
                </div>
              </div>
              {detail.whatsappSessions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">WhatsApp sessions</p>
                  <div className="space-y-1.5">
                    {detail.whatsappSessions.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 text-sm border border-slate-100 rounded p-2">
                        <span className="font-mono">{s.phoneNumber}</span>
                        {s.isVerified
                          ? <Badge className="bg-emerald-100 text-emerald-700 text-xs">verified</Badge>
                          : <Badge variant="secondary" className="text-xs">guest</Badge>}
                        <span className="text-slate-500 text-xs">{s.state}</span>
                        <span className="ml-auto text-slate-500 text-xs">{new Date(s.lastMessageAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detail.purchases.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Recent purchases</p>
                  <table className="w-full text-xs">
                    <thead className="text-slate-400">
                      <tr><th className="text-left py-1">Date</th><th className="text-left">Credits</th><th className="text-left">Amount</th><th className="text-left">Status</th></tr>
                    </thead>
                    <tbody>
                      {detail.purchases.slice(0, 10).map((p) => (
                        <tr key={p.id} className="border-t border-slate-50">
                          <td className="py-1 text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                          <td>{p.credits}</td>
                          <td>{fmtUsd(p.amount)}</td>
                          <td>
                            <Badge variant="secondary" className={p.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700 text-xs" : p.status === "REFUNDED" ? "bg-slate-100 text-slate-600 text-xs" : "bg-amber-100 text-amber-700 text-xs"}>{p.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
