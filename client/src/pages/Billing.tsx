import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Wallet,
  RefreshCw,
  Sparkles,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Clock,
  Minus,
  Plus,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import api from "@/lib/api";
import { useTranslation } from "react-i18next";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CreditBalance {
  weeklyCredits: number;
  purchasedCredits: number;
  totalCredits: number;
  resetWeek: string;
  nextResetAt: string;
}

interface Tier {
  credits: number;
  priceUsd: number;
  label: string;
  tag?: string;
}

interface CreditPurchase {
  id: string;
  credits: number;
  amount: string;
  status: "PENDING" | "COMPLETED" | "REFUNDED";
  stripeSessionId: string;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const WEEKLY_MAX = 30;
const CUSTOM_PRICE_PER_CREDIT = 0.1;

const statusConfig: Record<CreditPurchase["status"], { label: string; bg: string; text: string }> = {
  COMPLETED: { label: "Completed", bg: "#F0FDF4", text: "#15803D" },
  PENDING:   { label: "Pending",   bg: "#FFFBEB", text: "#B45309" },
  REFUNDED:  { label: "Refunded",  bg: "#F8FAFC", text: "#64748B" },
};

// Custom card shadow matching the design spec
const cardShadow = "0 10px 15px -3px rgba(15, 23, 42, 0.08)";

// ── Main component ─────────────────────────────────────────────────────────────

export function Billing() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [balance,          setBalance]          = useState<CreditBalance | null>(null);
  const [tiers,            setTiers]            = useState<Tier[]>([]);
  const [history,          setHistory]          = useState<CreditPurchase[]>([]);
  const [usage,            setUsage]            = useState<{ day: string; count: number }[]>([]);
  const [totalPurchased,   setTotalPurchased]   = useState(0);
  const [loading,          setLoading]          = useState(true);
  const [checkoutLoading,  setCheckoutLoading]  = useState(false);

  const [selectedTier,  setSelectedTier]  = useState<number | null>(null);
  const [customCredits, setCustomCredits] = useState(100);
  const [isCustom,      setIsCustom]      = useState(false);

  const selectedCredits = isCustom ? customCredits : (selectedTier ?? 0);
  const computedPrice   = isCustom
    ? Math.round(customCredits * CUSTOM_PRICE_PER_CREDIT * 100) / 100
    : tiers.find((t) => t.credits === selectedTier)?.priceUsd ?? 0;

  const unitPrice = selectedCredits > 0 ? computedPrice / selectedCredits : 0;

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [balanceRes, historyRes, tiersRes, usageRes] = await Promise.allSettled([
        api.get("/credits/balance"),
        api.get("/credits/history"),
        api.get("/credits/tiers"),
        api.get("/credits/usage"),
      ]);

      if (balanceRes.status === "fulfilled") setBalance(balanceRes.value.data);
      if (historyRes.status === "fulfilled") {
        setHistory(historyRes.value.data.purchases);
        setTotalPurchased(historyRes.value.data.totalPurchased);
      }
      if (tiersRes.status === "fulfilled") {
        const t = tiersRes.value.data.tiers as Tier[];
        setTiers(t);
        if (t.length > 0 && selectedTier === null) {
          setSelectedTier(t[1]?.credits ?? t[0].credits);
        }
      }
      if (usageRes.status === "fulfilled") setUsage(usageRes.value.data);
    } catch {
      toast.error("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Stripe return ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const status    = searchParams.get("payment");
    const sessionId = searchParams.get("session_id");
    if (status === "success" && sessionId) {
      api.post("/credits/verify-session", { sessionId })
        .then(r => {
          setBalance(r.data.balance);
          toast.success(`Payment confirmed! ${r.data.purchase.credits} credits added.`, { duration: 6000 });
          loadData();
        })
        .catch(() => {
          toast.success("Payment received! Credits will appear shortly.", { duration: 6000 });
          loadData();
        });
      navigate("/billing", { replace: true });
    } else if (status === "cancelled") {
      toast.info("Payment cancelled. No charges were made.");
      navigate("/billing", { replace: true });
    }
  }, [searchParams, navigate, loadData]);

  // ── Checkout ──────────────────────────────────────────────────────────────────

  const handleCheckout = async () => {
    if (!selectedCredits || selectedCredits < 10) {
      toast.error("Please select at least 10 credits");
      return;
    }
    setCheckoutLoading(true);
    try {
      const r = await api.post("/credits/checkout", { credits: selectedCredits });
      window.location.href = r.data.url;
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to start checkout"
      );
      setCheckoutLoading(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <RefreshCw className="h-6 w-6 text-teal-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-500">Loading billing information…</p>
        </div>
      </div>
    );
  }

  const maxUsage  = Math.max(...usage.map(u => u.count), 1);
  const weeklyPct = Math.min(100, Math.round(((balance?.weeklyCredits ?? 0) / WEEKLY_MAX) * 100));

  // Tier preset options shown in Custom Plan Builder (pick 3 representative ones)
  const customPresets = tiers.filter(t => [50, 100, 500].includes(t.credits));

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t("billing.title")}</h1>
        <p className="text-slate-500 text-sm mt-1">{t("billing.subtitle")}</p>
      </div>

      {/* ── 3-column layout ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[272px_1fr_264px] gap-5 items-start">

        {/* ══════════════ LEFT PANEL ══════════════ */}
        <div className="space-y-4">

          {/* Weekly + Purchased row */}
          <div className="grid grid-cols-2 gap-3">
            {/* Weekly */}
            <Card className="border-slate-200" style={{ boxShadow: cardShadow }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("billing.weekly")}</p>
                  <div className="h-6 w-6 rounded-md bg-teal-50 flex items-center justify-center">
                    <RefreshCw className="h-3 w-3 text-teal-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {balance?.weeklyCredits ?? 0}
                  <span className="text-xs font-normal text-slate-400 ml-1">/ {WEEKLY_MAX}</span>
                </p>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${weeklyPct}%` }} />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {t("billing.resetIn", { days: balance ? daysUntil(balance.nextResetAt) : "—" })}
                </p>
              </CardContent>
            </Card>

            {/* Purchased */}
            <Card className="border-slate-200" style={{ boxShadow: cardShadow }}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("billing.purchased")}</p>
                  <div className="h-6 w-6 rounded-md bg-indigo-50 flex items-center justify-center">
                    <Wallet className="h-3 w-3 text-indigo-500" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {balance?.purchasedCredits ?? 0}
                </p>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full" />
                <p className="text-[11px] text-slate-400 mt-1.5">Never exp.</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Total Available — Hero card ── */}
          <div
            className="rounded-xl p-5"
            style={{
              background: "#1A1F26",
              boxShadow: `0 0 0 1px rgba(20, 184, 166, 0.15), ${cardShadow}`,
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-5 w-5 rounded-full bg-teal-500/20 flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-teal-400" />
              </div>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "#94A3B8" }}
              >
                {t("billing.total")}
              </p>
            </div>
            <p className="text-4xl font-bold text-white leading-none">
              {balance?.totalCredits ?? 0}
              <span className="text-base font-normal ml-2" style={{ color: "#94A3B8" }}>Cr.</span>
            </p>
          </div>

          {/* Usage chart */}
          <Card className="border-slate-200" style={{ boxShadow: cardShadow }}>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-900">Usage · Last 7 Days</CardTitle>
                <span className="text-[11px] text-slate-400 font-medium">AI Enhancements</span>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="flex items-end justify-between gap-1 h-20">
                {(usage.length > 0 ? usage : Array.from({ length: 7 }, (_, i) => ({ day: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i], count: 0 }))).map((item, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group h-full justify-end">
                    <div className="relative w-full flex justify-center">
                      {item.count > 0 && (
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {item.count}
                        </div>
                      )}
                      <div
                        className="w-6 rounded-t-sm transition-colors"
                        style={{
                          height: `${Math.max((item.count / maxUsage) * 72, item.count > 0 ? 8 : 3)}px`,
                          background: item.count > 0 ? "#0D9488" : "#E2E8F0",
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{item.day}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Info note */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">How credits work</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              30 free monthly credits reset on the 1st of each month. Purchased credits activate when monthly ones run out and never expire.
            </p>
          </div>
        </div>

        {/* ══════════════ MIDDLE PANEL ══════════════ */}
        <Card className="border-slate-200" style={{ boxShadow: cardShadow }}>
          <CardHeader className="p-5 pb-4 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">Choose a Plan</CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">One-time credit packs · no subscription</p>
          </CardHeader>
          <CardContent className="p-5 space-y-4">

            {/* ── Compact tier grid ── */}
            <div className="grid grid-cols-2 gap-2.5">
              {tiers.map(tier => {
                const sel = !isCustom && selectedTier === tier.credits;
                return (
                  <div
                    key={tier.credits}
                    onClick={() => { setIsCustom(false); setSelectedTier(tier.credits); }}
                    className="cursor-pointer rounded-xl border-2 p-3.5 transition-all"
                    style={{
                      borderColor: sel ? "#0D9488" : "#E2E8F0",
                      background: sel ? "#F0FDFA" : "#FFFFFF",
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-700">{tier.label}</p>
                      {tier.tag && (
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white"
                          style={{ background: "#0D9488" }}
                        >
                          {tier.tag}
                        </span>
                      )}
                    </div>

                    <p className="text-xl font-bold text-slate-900">${tier.priceUsd.toFixed(2)}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{tier.credits} credits</p>

                    {/* Features (compact) */}
                    <div className="mt-2.5 space-y-1">
                      {["Never expire", "All AI features"].map((f, fi) => (
                        <div key={fi} className="flex items-center gap-1.5">
                          <CheckCircle2
                            className="h-3 w-3 flex-shrink-0"
                            style={{ color: sel ? "#0D9488" : "#CBD5E1" }}
                          />
                          <span className="text-[11px]" style={{ color: sel ? "#0F766E" : "#94A3B8" }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Custom Plan Builder ── */}
            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">Custom Plan Builder</p>
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">

                {/* Header row: title + amount/pricing */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Customize Your Credit Pack</p>
                    <p className="text-xs text-slate-500 mt-0.5">Credit number</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[11px] text-slate-400">Amount</p>
                      <p className="text-sm font-bold" style={{ color: "#0D9488" }}>
                        ${isCustom ? computedPrice.toFixed(2) : (tiers.find(t => t.credits === selectedTier)?.priceUsd ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Pricing</p>
                      <p className="text-sm font-semibold text-slate-700">
                        ${isCustom ? CUSTOM_PRICE_PER_CREDIT.toFixed(3) : selectedTier ? ((tiers.find(t => t.credits === selectedTier)?.priceUsd ?? 0) / (selectedTier || 1)).toFixed(3) : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* +/- Credit Input */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => { setIsCustom(true); setCustomCredits(c => Math.max(10, c - 10)); }}
                    className="w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-600 hover:border-teal-500 hover:text-teal-600 transition-colors flex-shrink-0"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>

                  <div
                    className="flex-1 h-9 rounded-lg border-2 flex items-center justify-center text-sm font-semibold transition-all"
                    style={{
                      borderColor: isCustom ? "#0D9488" : "#E2E8F0",
                      background: isCustom ? "#F0FDFA" : "#FFFFFF",
                      color: isCustom ? "#0F766E" : "#334155",
                    }}
                  >
                    {isCustom ? customCredits : (selectedTier ?? "—")} Cr.
                  </div>

                  <button
                    onClick={() => { setIsCustom(true); setCustomCredits(c => Math.min(1000, c + 10)); }}
                    className="w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center text-slate-600 hover:border-teal-500 hover:text-teal-600 transition-colors flex-shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>

                  {/* Preset quick-select chips */}
                  {customPresets.map(preset => {
                    const isPresetSel = isCustom && customCredits === preset.credits;
                    return (
                      <button
                        key={preset.credits}
                        onClick={() => { setIsCustom(true); setCustomCredits(preset.credits); }}
                        className="flex flex-col items-start rounded-lg border-2 px-2.5 py-1.5 transition-all flex-shrink-0"
                        style={{
                          borderColor: isPresetSel ? "#0D9488" : "#E2E8F0",
                          background: isPresetSel ? "#F0FDFA" : "#FFFFFF",
                        }}
                      >
                        <div className="flex items-center gap-1 mb-0.5">
                          <div
                            className="w-2.5 h-2.5 rounded-sm border flex-shrink-0"
                            style={{
                              borderColor: isPresetSel ? "#0D9488" : "#CBD5E1",
                              background: isPresetSel ? "#0D9488" : "transparent",
                            }}
                          />
                          <span className="text-[11px] font-semibold text-slate-800">{preset.credits} Cr.</span>
                        </div>
                        <span className="text-[10px] text-slate-400 pl-3.5">${preset.priceUsd.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ══════════════ RIGHT PANEL ══════════════ */}
        <div className="space-y-4">

          {/* ── Order Summary — Dark card ── */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "#2D3748",
              boxShadow: cardShadow,
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3.5" style={{ borderBottom: "1px solid #4A5568" }}>
              <div className="h-5 w-5 rounded-md bg-teal-500/20 flex items-center justify-center">
                <CreditCard className="h-3 w-3 text-teal-400" />
              </div>
              <p className="text-sm font-semibold text-white">{t("billing.orderSummary")}</p>
            </div>

            {/* Rows */}
            <div className="px-4 py-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span style={{ color: "#94A3B8" }}>Credits Bundle</span>
                <span className="font-medium text-white">
                  {selectedCredits > 0 ? `${selectedCredits} Cr.` : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "#94A3B8" }}>Unit Price</span>
                <span className="font-medium text-white">
                  {selectedCredits > 0 ? `$${unitPrice.toFixed(3)}` : "—"}
                </span>
              </div>

              <div className="pt-2.5" style={{ borderTop: "1px solid #4A5568" }}>
                <div className="flex justify-between text-sm mb-2">
                  <span style={{ color: "#94A3B8" }}>Subtotal</span>
                  <span className="font-medium text-white">${computedPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: "#94A3B8" }}>Processing Fee</span>
                  <span style={{ color: "#64748B" }}>$0.00</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2.5" style={{ borderTop: "1px solid #4A5568" }}>
                <span className="text-sm font-semibold text-white">Total</span>
                <span className="text-xl font-bold" style={{ color: "#2DD4BF" }}>
                  ${computedPrice.toFixed(2)}
                </span>
              </div>

              {/* Checkout button */}
              <button
                onClick={handleCheckout}
                disabled={checkoutLoading || selectedCredits === 0}
                className="w-full h-10 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold text-white transition-colors mt-1 disabled:opacity-50"
                style={{ background: checkoutLoading || selectedCredits === 0 ? "#374151" : "#0D9488" }}
                onMouseEnter={e => { if (!checkoutLoading && selectedCredits > 0) (e.currentTarget as HTMLButtonElement).style.background = "#0F766E"; }}
                onMouseLeave={e => { if (!checkoutLoading && selectedCredits > 0) (e.currentTarget as HTMLButtonElement).style.background = "#0D9488"; }}
              >
                {checkoutLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <div className="w-5 h-5 bg-white rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ color: "#0D9488" }}>
                      S
                    </div>
                    {t("billing.checkout", { amount: computedPrice.toFixed(2) })}
                    <ChevronRight className="h-4 w-4 ml-auto" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 pt-1">
                <BadgeCheck className="h-3.5 w-3.5" style={{ color: "#64748B" }} />
                <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "#64748B" }}>
                  {t("billing.secure")}
                </span>
              </div>

            </div>
          </div>

          {/* ── Recent Activity — White card ── */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              background: "#FFFFFF",
              borderColor: "#E2E8F0",
              boxShadow: cardShadow,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: "1px solid #E2E8F0" }}>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: "#64748B" }} />
                <p className="text-sm font-semibold text-slate-900">{t("billing.recent")}</p>
              </div>
              {totalPurchased > 0 && (
                <Badge variant="secondary" className="text-xs">{totalPurchased} Cr. total</Badge>
              )}
            </div>

            {/* Table header */}
            {history.length > 0 && (
              <div
                className="grid grid-cols-4 px-4 py-2"
                style={{ borderBottom: "1px solid #E2E8F0" }}
              >
                {["Date", "Plan", "Credits", "Status"].map(h => (
                  <span
                    key={h}
                    className="text-[11px] font-semibold uppercase"
                    style={{ color: "#64748B", letterSpacing: "0.05em" }}
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}

            {/* Rows */}
            {history.length > 0 ? (
              <div>
                {history.slice(0, 6).map(h => {
                  const tierLabel = tiers.find(t => t.credits === h.credits)?.label ?? "Custom";
                  const sc = statusConfig[h.status];
                  return (
                    <div
                      key={h.id}
                      className="grid grid-cols-4 px-4 py-3 items-center hover:bg-slate-50 transition-colors"
                      style={{ borderBottom: "1px solid #F1F5F9" }}
                    >
                      <span className="text-[11px] text-slate-500">
                        {new Date(h.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-[11px] font-medium text-slate-700">{tierLabel}</span>
                      <span className="text-[11px] font-semibold" style={{ color: "#0D9488" }}>+{h.credits}</span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit"
                        style={{ background: sc.bg, color: sc.text }}
                      >
                        {sc.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-3 px-4 text-center">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center"
                  style={{ background: "#F8FAFC" }}
                >
                  <Wallet className="h-5 w-5" style={{ color: "#CBD5E1" }} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">No recent transactions yet</p>
                  <p className="text-xs text-slate-400 mt-1">Select a plan to get started</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
