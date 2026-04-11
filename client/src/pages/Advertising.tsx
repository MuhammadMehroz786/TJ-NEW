import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import api from "@/lib/api";

interface CampaignItem {
  id: string;
  status: string;
  brief: string;
  amount: number;
  socialLinks: { platform: string; url: string }[];
  revisionNote: string | null;
  product: { id: string; title: string; images: string[]; price: number };
  creator: { name: string; email: string };
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

export function Advertising() {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CampaignItem | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

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

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await api.patch(`/campaigns/${selected.id}/approve`);
      toast.success("Campaign approved! Payment released.");
      setSelected(null);
      fetchCampaigns();
    } catch { toast.error("Failed to approve"); }
    finally { setActionLoading(false); }
  };

  const handleRevision = async () => {
    if (!selected || !revisionNote.trim()) { toast.error("Please add a revision note"); return; }
    setActionLoading(true);
    try {
      await api.patch(`/campaigns/${selected.id}/revision`, { revisionNote });
      toast.success("Revision requested");
      setSelected(null);
      setRevisionNote("");
      fetchCampaigns();
    } catch { toast.error("Failed to request revision"); }
    finally { setActionLoading(false); }
  };

  const totalPages = Math.ceil(total / 20);
  const tabs = [
    { value: "all", label: "All" },
    { value: "IN_PROGRESS", label: "Active" },
    { value: "SUBMITTED", label: "Review" },
    { value: "REVISION_REQUESTED", label: "Revision" },
    { value: "COMPLETED", label: "Completed" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Advertising</h1>

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
            <div className="text-center py-16">
              <p className="text-slate-400">No campaigns yet</p>
              <p className="text-sm text-slate-400 mt-1">Go to Products and click "Advertise" on a product to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Product</TableHead><TableHead>Creator</TableHead><TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => { setSelected(c); setRevisionNote(""); }}>
                    <TableCell className="font-medium">{c.product.title}</TableCell>
                    <TableCell>{c.creator.name}</TableCell>
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
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">Creator: {selected.creator.name}</span>
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
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Payment</span>
                  <span className="font-medium">{selected.payment?.status || "—"}</span>
                </div>

                {selected.socialLinks?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Social Media Links</p>
                    <div className="space-y-2">
                      {selected.socialLinks.map((link, i) => (
                        <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700">
                          <ExternalLink className="h-3 w-3" />{link.platform}: {link.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {selected.status === "SUBMITTED" && (
                  <div className="space-y-3 pt-2 border-t">
                    <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={actionLoading} onClick={handleApprove}>
                      Approve & Release Payment
                    </Button>
                    <div>
                      <textarea placeholder="Describe what needs to change..." value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)}
                        className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2" rows={2} />
                      <Button variant="outline" className="w-full mt-2 text-orange-600 border-orange-200 hover:bg-orange-50" disabled={actionLoading} onClick={handleRevision}>
                        Request Revision
                      </Button>
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
