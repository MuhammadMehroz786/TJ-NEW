import { useEffect, useState, type FormEvent } from "react";
import { Link2, Plus, Trash2, ExternalLink, MousePointerClick, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import api from "@/lib/api";

interface AffiliateLink {
  id: string;
  slug: string;
  targetUrl: string;
  product: { id: string; title: string; price: number; currency: string; images: string[] };
  _count: { clicks: number };
  createdAt: string;
}

export function AffiliateLinks() {
  const [links, setLinks] = useState<AffiliateLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ productId: "", targetUrl: "" });
  const [products, setProducts] = useState<{ id: string; title: string }[]>([]);

  const fetchLinks = () => {
    api.get("/affiliate-links")
      .then((res) => setLinks(res.data.data))
      .catch(() => toast.error("Failed to load affiliate links"))
      .finally(() => setLoading(false));
  };

  const fetchProducts = () => {
    api.get("/products?pageSize=100")
      .then((res) => setProducts(res.data.data.map((p: { id: string; title: string }) => ({ id: p.id, title: p.title }))))
      .catch(() => {});
  };

  useEffect(() => { fetchLinks(); fetchProducts(); }, []);

  const openCreate = () => {
    setForm({ productId: "", targetUrl: "" });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/affiliate-links", form);
      toast.success("Affiliate link created");
      setDialogOpen(false);
      fetchLinks();
    } catch {
      toast.error("Failed to create affiliate link");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/affiliate-links/${id}`);
      toast.success("Affiliate link deleted");
      fetchLinks();
    } catch {
      toast.error("Failed to delete affiliate link");
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/api/affiliate-links/track/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Affiliate Links</h1>
          <p className="text-slate-500 mt-1">Generate trackable links for products you promote</p>
        </div>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="h-4 w-4 mr-2" /> New Link
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="border-slate-200/60">
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Total Links</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{links.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60">
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Total Clicks</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">
              {links.reduce((sum, l) => sum + l._count.clicks, 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60">
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Avg Clicks/Link</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">
              {links.length ? Math.round(links.reduce((sum, l) => sum + l._count.clicks, 0) / links.length) : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Link2 className="h-5 w-5 text-slate-400" />
            Your Links
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-12">
              <Link2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No affiliate links yet</p>
              <p className="text-slate-400 text-xs mt-1">Create a link to start tracking clicks on products you promote</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Tracking Link</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-center">Clicks</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium text-slate-900">{l.product.title}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                        /track/{l.slug}
                      </code>
                    </TableCell>
                    <TableCell>
                      <a href={l.targetUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline text-sm flex items-center gap-1">
                        {(() => { try { return new URL(l.targetUrl).hostname; } catch { return l.targetUrl; } })()} <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                        <MousePointerClick className="h-3 w-3 mr-1" />
                        {l._count.clicks}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => copyLink(l.slug)} title="Copy link">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(l.id)} className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Affiliate Link</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Product</Label>
              <select
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Target URL</Label>
              <Input
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                placeholder="https://tiktok.com/shop/product-link"
                required
                type="url"
              />
              <p className="text-xs text-slate-400 mt-1">Where the customer will be redirected (TikTok Shop, Instagram, WhatsApp, etc.)</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-teal-600 hover:bg-teal-700">
                {saving ? "Creating..." : "Create Link"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
