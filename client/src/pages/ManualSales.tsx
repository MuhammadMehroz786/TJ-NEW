import { useEffect, useState, type FormEvent } from "react";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import api from "@/lib/api";

interface ManualSale {
  id: string;
  amount: string;
  orderId: string | null;
  note: string | null;
  creator: { id: string; name: string; email: string };
  merchant: { id: string; name: string; email: string };
  product: { id: string; title: string } | null;
  createdAt: string;
}

interface Creator {
  userId: string;
  displayName: string;
}

interface Product {
  id: string;
  title: string;
}

export function ManualSales() {
  const [sales, setSales] = useState<ManualSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ creatorId: "", productId: "", orderId: "", amount: "", note: "" });

  const fetchSales = () => {
    api.get("/manual-sales")
      .then((res) => setSales(res.data.data))
      .catch(() => toast.error("Failed to load sales"))
      .finally(() => setLoading(false));
  };

  const fetchCreators = () => {
    api.get("/creators")
      .then((res) => setCreators(res.data.data))
      .catch(() => {});
  };

  const fetchProducts = () => {
    api.get("/products?pageSize=100")
      .then((res) => setProducts(res.data.data.map((p: Product) => ({ id: p.id, title: p.title }))))
      .catch(() => {});
  };

  useEffect(() => { fetchSales(); fetchCreators(); fetchProducts(); }, []);

  const openCreate = () => {
    setForm({ creatorId: "", productId: "", orderId: "", amount: "", note: "" });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/manual-sales", {
        creatorId: form.creatorId,
        productId: form.productId || null,
        orderId: form.orderId || null,
        amount: form.amount,
        note: form.note || null,
      });
      toast.success("Sale attributed");
      setDialogOpen(false);
      fetchSales();
    } catch {
      toast.error("Failed to save sale");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/manual-sales/${id}`);
      toast.success("Sale deleted");
      fetchSales();
    } catch {
      toast.error("Failed to delete sale");
    }
  };

  const totalSales = sales.reduce((sum, s) => sum + parseFloat(s.amount), 0);

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sales Attribution</h1>
          <p className="text-slate-500 mt-1">Manually attribute orders to creators for commission tracking</p>
        </div>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="h-4 w-4 mr-2" /> Attribute Sale
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card className="border-slate-200/60">
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Total Attributed Sales</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{sales.length}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200/60">
          <CardContent className="p-6">
            <p className="text-sm text-slate-500">Total Amount</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{totalSales.toFixed(2)} SAR</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-slate-400" />
            Attributed Sales
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No sales attributed yet</p>
              <p className="text-slate-400 text-xs mt-1">Attribute an order to a creator to track commissions</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Creator</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-slate-600 text-sm">{formatDate(s.createdAt)}</TableCell>
                    <TableCell className="font-medium text-slate-900">{s.creator.name}</TableCell>
                    <TableCell className="text-slate-600">{s.product?.title || "—"}</TableCell>
                    <TableCell className="font-mono text-sm text-slate-600">{s.orderId || "—"}</TableCell>
                    <TableCell className="font-semibold text-slate-900">{parseFloat(s.amount).toFixed(2)} SAR</TableCell>
                    <TableCell className="text-slate-500 text-sm">{s.note || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            <DialogTitle>Attribute Sale to Creator</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Creator</Label>
              <select
                value={form.creatorId}
                onChange={(e) => setForm({ ...form, creatorId: e.target.value })}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a creator</option>
                {creators.map((c) => (
                  <option key={c.userId} value={c.userId}>{c.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Product (optional)</Label>
              <select
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">No specific product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Order ID (optional)</Label>
              <Input
                value={form.orderId}
                onChange={(e) => setForm({ ...form, orderId: e.target.value })}
                placeholder="e.g. ORD-12345"
              />
            </div>
            <div>
              <Label>Amount (SAR)</Label>
              <Input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                type="number"
                step="0.01"
                required
              />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="e.g. Customer mentioned creator's code"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-teal-600 hover:bg-teal-700">
                {saving ? "Saving..." : "Attribute Sale"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
