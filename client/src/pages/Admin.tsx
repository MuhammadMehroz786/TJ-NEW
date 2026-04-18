import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, DollarSign, Sparkles, MessageCircle, Search, ShieldCheck, Wallet, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api from "@/lib/api";

interface Overview {
  users: { total: number; merchants: number; creators: number; newLast24h: number; newLast7d: number };
  revenue: { totalUsd: number; totalCreditsSold: number; thisMonthUsd: number; completedPurchases: number; pendingPurchases: number };
  aiStudio: { totalEnhancements: number; enhancementsLast7d: number };
  whatsapp: { totalSessions: number; verifiedSessions: number };
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "MERCHANT" | "CREATOR" | "ADMIN";
  aiCredits: number;
  purchasedCredits: number;
  createdAt: string;
}

interface PurchaseRow {
  id: string;
  credits: number;
  amount: string | number;
  status: "PENDING" | "COMPLETED" | "REFUNDED";
  stripeSessionId: string;
  createdAt: string;
}

interface WaSession {
  id: string;
  phoneNumber: string;
  isVerified: boolean;
  state: string;
  creditsUsed: number;
  creditsLimit: number;
  lastMessageAt: string;
}

interface UserDetail {
  user: UserRow & { aiCreditsWeekKey: string; _count: { whatsappSessions: number; creditPurchases: number } };
  purchases: PurchaseRow[];
  whatsappSessions: WaSession[];
  imageCount: number;
  productCount: number;
}

function formatUsd(n: number | string): string {
  return `$${Number(n).toFixed(2)}`;
}

function Stat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
          <div className="h-8 w-8 rounded-md bg-slate-50 flex items-center justify-center">
            <Icon className="h-4 w-4 text-slate-600" />
          </div>
        </div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function Admin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [grantAmount, setGrantAmount] = useState("50");
  const [grantNote, setGrantNote] = useState("");
  const [granting, setGranting] = useState(false);

  const fetchOverview = useCallback(() => {
    api.get("/admin/overview")
      .then((r) => setOverview(r.data))
      .catch(() => toast.error("Failed to load overview"));
  }, []);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page, pageSize: 25 };
    if (search) params.search = search;
    if (roleFilter !== "all") params.role = roleFilter;
    api.get("/admin/users", { params })
      .then((r) => { setUsers(r.data.data); setUserTotal(r.data.total); })
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, [page, search, roleFilter]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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
    if (!Number.isInteger(credits) || credits <= 0) {
      toast.error("Enter a positive number of credits");
      return;
    }
    setGranting(true);
    try {
      const r = await api.post(`/admin/users/${detail.user.id}/grant-credits`, { credits, note: grantNote });
      toast.success(`Granted ${r.data.granted} credits`);
      setGrantAmount("50");
      setGrantNote("");
      // refresh detail + overview + list
      await openDetail(detail.user.id);
      fetchOverview();
      fetchUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to grant credits";
      toast.error(msg);
    } finally {
      setGranting(false);
    }
  };

  const handleRoleChange = async (newRole: "MERCHANT" | "CREATOR" | "ADMIN") => {
    if (!detail) return;
    try {
      await api.patch(`/admin/users/${detail.user.id}/role`, { role: newRole });
      toast.success(`Role updated to ${newRole}`);
      await openDetail(detail.user.id);
      fetchUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to change role";
      toast.error(msg);
    }
  };

  const totalPages = useMemo(() => Math.max(1, Math.ceil(userTotal / 25)), [userTotal]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-teal-600" />
          Admin
        </h1>
        <p className="text-slate-500 text-sm mt-1">System overview and user management</p>
      </div>

      {/* Overview stats */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat icon={Users} label="Total Users" value={overview.users.total} sub={`${overview.users.newLast7d} new this week`} />
          <Stat icon={DollarSign} label="Revenue (all-time)" value={formatUsd(overview.revenue.totalUsd)} sub={`${formatUsd(overview.revenue.thisMonthUsd)} this month`} />
          <Stat icon={Sparkles} label="Enhancements" value={overview.aiStudio.totalEnhancements.toLocaleString()} sub={`${overview.aiStudio.enhancementsLast7d} last 7 days`} />
          <Stat icon={MessageCircle} label="WhatsApp Sessions" value={overview.whatsapp.totalSessions} sub={`${overview.whatsapp.verifiedSessions} verified`} />
        </div>
      )}

      {/* Users panel */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <h2 className="font-semibold text-slate-900 mr-auto">Users</h2>
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search email or name..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-10"
              />
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
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No users match your filter</div>
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
                    <th className="px-4 py-2.5 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-slate-900 font-medium">{u.email}</td>
                      <td className="px-4 py-3 text-slate-600">{u.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className={
                          u.role === "ADMIN" ? "bg-purple-100 text-purple-700"
                          : u.role === "MERCHANT" ? "bg-teal-100 text-teal-700"
                          : "bg-indigo-100 text-indigo-700"
                        }>{u.role}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {u.aiCredits} <span className="text-slate-400">+{u.purchasedCredits}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(u.id)} className="h-7 px-2">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{userTotal.toLocaleString()} users total</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User detail dialog */}
      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>User Details</DialogTitle></DialogHeader>
          {detailLoading || !detail ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading...</div>
          ) : (
            <div className="space-y-5">
              {/* Identity */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Identity</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">Email</span><p className="font-medium text-slate-900">{detail.user.email}</p></div>
                  <div><span className="text-slate-500">Name</span><p className="font-medium text-slate-900">{detail.user.name}</p></div>
                  <div><span className="text-slate-500">User ID</span><p className="font-mono text-xs text-slate-600">{detail.user.id}</p></div>
                  <div><span className="text-slate-500">Joined</span><p className="text-slate-900">{new Date(detail.user.createdAt).toLocaleString()}</p></div>
                </div>
              </div>

              {/* Role + credits */}
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
                    <span><Wallet className="h-3.5 w-3.5 inline mr-1 text-slate-400" /> Weekly: <span className="font-semibold">{detail.user.aiCredits}</span></span>
                    <span>Purchased: <span className="font-semibold">{detail.user.purchasedCredits}</span></span>
                  </div>
                </div>
              </div>

              {/* Grant credits */}
              <div className="p-3 rounded-lg bg-teal-50/50 border border-teal-100">
                <p className="text-xs font-semibold text-teal-800 mb-2">Grant credits (manual)</p>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} max={10000} value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} className="w-24" />
                  <Input placeholder="Note (optional)" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} className="flex-1" />
                  <Button onClick={handleGrant} disabled={granting} className="bg-teal-600 hover:bg-teal-700 text-white">
                    {granting ? "Granting..." : "Grant"}
                  </Button>
                </div>
              </div>

              {/* Activity */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Activity</p>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div><span className="text-slate-500">Enhanced images</span><p className="font-semibold text-slate-900">{detail.imageCount}</p></div>
                  <div><span className="text-slate-500">Products</span><p className="font-semibold text-slate-900">{detail.productCount}</p></div>
                  <div><span className="text-slate-500">Purchases</span><p className="font-semibold text-slate-900">{detail.user._count.creditPurchases}</p></div>
                  <div><span className="text-slate-500">WhatsApp</span><p className="font-semibold text-slate-900">{detail.user._count.whatsappSessions}</p></div>
                </div>
              </div>

              {/* WhatsApp sessions */}
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

              {/* Recent purchases */}
              {detail.purchases.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Recent purchases</p>
                  <table className="w-full text-xs">
                    <thead className="text-slate-400">
                      <tr>
                        <th className="text-left py-1">Date</th>
                        <th className="text-left">Credits</th>
                        <th className="text-left">Amount</th>
                        <th className="text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.purchases.slice(0, 10).map((p) => (
                        <tr key={p.id} className="border-t border-slate-50">
                          <td className="py-1 text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                          <td>{p.credits}</td>
                          <td>{formatUsd(p.amount)}</td>
                          <td>
                            <Badge variant="secondary" className={
                              p.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700 text-xs"
                              : p.status === "REFUNDED" ? "bg-slate-100 text-slate-600 text-xs"
                              : "bg-amber-100 text-amber-700 text-xs"
                            }>{p.status}</Badge>
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
