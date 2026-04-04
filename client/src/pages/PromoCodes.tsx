import { useEffect, useState, type FormEvent } from "react";
import { Tag, Plus, Trash2, Pencil } from "lucide-react";
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

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount: string | null;
  isActive: boolean;
  createdAt: string;
}

export function PromoCodes() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "", description: "", discount: "" });

  const fetchCodes = () => {
    api.get("/promo-codes")
      .then((res) => setCodes(res.data.data))
      .catch(() => toast.error("Failed to load promo codes"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCodes(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", description: "", discount: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: PromoCode) => {
    setEditing(c);
    setForm({ code: c.code, description: c.description || "", discount: c.discount || "" });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/promo-codes/${editing.id}`, form);
        toast.success("Promo code updated");
      } else {
        await api.post("/promo-codes", form);
        toast.success("Promo code created");
      }
      setDialogOpen(false);
      fetchCodes();
    } catch {
      toast.error("Failed to save promo code");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/promo-codes/${id}`);
      toast.success("Promo code deleted");
      fetchCodes();
    } catch {
      toast.error("Failed to delete promo code");
    }
  };

  const toggleActive = async (c: PromoCode) => {
    try {
      await api.put(`/promo-codes/${c.id}`, { isActive: !c.isActive });
      fetchCodes();
    } catch {
      toast.error("Failed to update promo code");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Promo Codes</h1>
          <p className="text-slate-500 mt-1">Create and manage promo codes for creators to share</p>
        </div>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700">
          <Plus className="h-4 w-4 mr-2" /> New Promo Code
        </Button>
      </div>

      <Card className="border-slate-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Tag className="h-5 w-5 text-slate-400" />
            All Promo Codes ({codes.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}
            </div>
          ) : codes.length === 0 ? (
            <div className="text-center py-12">
              <Tag className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No promo codes yet</p>
              <p className="text-slate-400 text-xs mt-1">Create a promo code for creators to share with their audience</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold text-slate-900">{c.code}</TableCell>
                    <TableCell className="text-slate-600">{c.description || "—"}</TableCell>
                    <TableCell className="text-slate-600">{c.discount || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className={`cursor-pointer ${c.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}
                        onClick={() => toggleActive(c)}
                      >
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-700">
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
            <DialogTitle>{editing ? "Edit Promo Code" : "New Promo Code"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. SAVE20"
                required
                className="font-mono"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. 20% off first order"
              />
            </div>
            <div>
              <Label>Discount</Label>
              <Input
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                placeholder="e.g. 20% or 50 SAR"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-teal-600 hover:bg-teal-700">
                {saving ? "Saving..." : editing ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
