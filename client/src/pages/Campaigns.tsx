import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, AlertCircle, ExternalLink } from "lucide-react";
import api from "@/lib/api";

interface CampaignItem {
  id: string;
  status: string;
  brief: string;
  amount: number;
  socialLinks: { platform: string; url: string }[];
  revisionNote: string | null;
  product: { id: string; title: string; images: string[]; price: number; currency: string };
  merchant: { name: string; email: string };
  payment: { status: string } | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SUBMITTED: "bg-purple-100 text-purple-700",
  COMPLETED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
  REVISION_REQUESTED: "bg-orange-100 text-orange-700",
};

const PLATFORMS = ["instagram", "tiktok", "snapchat", "twitter", "youtube"];

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CampaignItem | null>(null);
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchCampaigns = () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (statusFilter !== "all") params.status = statusFilter;
    api.get("/campaigns", { params })
      .then((res) => { setCampaigns(res.data.data); setTotal(res.data.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCampaigns(); }, [page, statusFilter]);

  const openDetail = (campaign: CampaignItem) => {
    setSelected(campaign);
    setSocialLinks(campaign.socialLinks?.length ? campaign.socialLinks : [{ platform: "instagram", url: "" }]);
  };

  const handleSubmitLinks = async () => {
    if (!selected) return;
    const validLinks = socialLinks.filter((l) => l.url);
    if (validLinks.length === 0) { toast.error("Add at least one social link"); return; }
    setSubmitting(true);
    try {
      await api.patch(`/campaigns/${selected.id}/submit`, { socialLinks: validLinks });
      toast.success("Links submitted for review");
      setSelected(null);
      fetchCampaigns();
    } catch { toast.error("Failed to submit links"); }
    finally { setSubmitting(false); }
  };

  const handleAccept = async (id: string) => {
    try { await api.patch(`/campaigns/${id}/accept`); toast.success("Campaign accepted"); setSelected(null); fetchCampaigns(); }
    catch { toast.error("Failed to accept"); }
  };

  const handleDecline = async (id: string) => {
    try { await api.patch(`/campaigns/${id}/decline`); toast.success("Campaign declined"); setSelected(null); fetchCampaigns(); }
    catch { toast.error("Failed to decline"); }
  };

  const totalPages = Math.ceil(total / 20);
  const tabs = [
    { value: "all", label: "All" },
    { value: "PENDING", label: "Pending" },
    { value: "IN_PROGRESS", label: "Active" },
    { value: "COMPLETED", label: "Completed" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Campaigns</h1>

      <div className="flex gap-1 mb-4 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.value} onClick={() => { setStatusFilter(t.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${statusFilter === t.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >{t.label}</button>
        ))}
      </div>

      <Card className="border-slate-200/60">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-50 rounded animate-pulse" />)}</div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-16"><p className="text-slate-400">No campaigns found</p></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Product</TableHead><TableHead>Merchant</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(c)}>
                    <TableCell className="font-medium">{c.product.title}</TableCell>
                    <TableCell>{c.merchant.name}</TableCell>
                    <TableCell><Badge className={`text-xs ${statusColors[c.status] || ""}`}>{c.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>{c.amount} SAR</TableCell>
                    <TableCell className="text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader><DialogTitle>{selected.product.title}</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-2">
                {(selected.product.images as string[])?.length > 0 && (
                  <img src={(selected.product.images as string[])[0]} alt={selected.product.title}
                    className="w-full h-48 object-cover rounded-lg" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">From: {selected.merchant.name}</span>
                  <Badge className={`text-xs ${statusColors[selected.status] || ""}`}>{selected.status.replace(/_/g, " ")}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-1">Brief</p>
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{selected.brief}</p>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-semibold text-slate-900">{selected.amount} SAR</span>
                </div>

                {selected.revisionNote && (
                  <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-orange-800">Revision Requested</p>
                      <p className="text-sm text-orange-600">{selected.revisionNote}</p>
                    </div>
                  </div>
                )}

                {selected.status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-teal-600 hover:bg-teal-700 text-white" onClick={() => handleAccept(selected.id)}>Accept</Button>
                    <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleDecline(selected.id)}>Decline</Button>
                  </div>
                )}

                {(selected.status === "IN_PROGRESS" || selected.status === "REVISION_REQUESTED") && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-slate-700">Social Media Links</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => setSocialLinks([...socialLinks, { platform: "instagram", url: "" }])}>
                        <Plus className="h-3 w-3 mr-1" /> Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {socialLinks.map((link, i) => (
                        <div key={i} className="flex gap-2">
                          <Select value={link.platform} onValueChange={(v) => { const u = [...socialLinks]; u[i] = { ...u[i], platform: v }; setSocialLinks(u); }}>
                            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}</SelectContent>
                          </Select>
                          <Input className="flex-1" placeholder="https://..." value={link.url}
                            onChange={(e) => { const u = [...socialLinks]; u[i] = { ...u[i], url: e.target.value }; setSocialLinks(u); }} />
                          {socialLinks.length > 1 && (
                            <Button variant="ghost" size="sm" className="text-red-500 px-2" onClick={() => setSocialLinks(socialLinks.filter((_, j) => j !== i))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button className="w-full mt-3 bg-teal-600 hover:bg-teal-700 text-white" disabled={submitting} onClick={handleSubmitLinks}>
                      {submitting ? "Submitting..." : "Submit Links for Review"}
                    </Button>
                  </div>
                )}

                {(selected.status === "SUBMITTED" || selected.status === "COMPLETED") && selected.socialLinks?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Submitted Links</p>
                    <div className="space-y-2">
                      {selected.socialLinks.map((link, i) => (
                        <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700">
                          <ExternalLink className="h-3 w-3" />{link.platform}: {link.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
