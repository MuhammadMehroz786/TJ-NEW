import { useEffect, useState } from "react";
import { Search, ShoppingBag, Link2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";

interface MarketplaceProduct {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  category: string | null;
  tags: string[];
  vendor: string | null;
  merchantName: string;
  hasAffiliateLink: boolean;
}

export function ProductMarketplace() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [linkDialog, setLinkDialog] = useState<MarketplaceProduct | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchProducts = () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: "20" };
    if (search) params.search = search;
    if (selectedCategory) params.category = selectedCategory;
    api.get("/marketplace/products", { params })
      .then((res) => { setProducts(res.data.data); setTotal(res.data.total); })
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get("/marketplace/categories").then((res) => setCategories(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchProducts(); }, [page, selectedCategory]);

  const handleSearch = () => { setPage(1); fetchProducts(); };

  const createAffiliateLink = async () => {
    if (!linkDialog || !targetUrl) return;
    setCreating(true);
    try {
      await api.post("/affiliate-links", { productId: linkDialog.id, targetUrl });
      toast.success("Affiliate link created!");
      setLinkDialog(null);
      setTargetUrl("");
      fetchProducts();
    } catch {
      toast.error("Failed to create affiliate link");
    } finally {
      setCreating(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Product Marketplace</h1>
        <p className="text-slate-500 mt-1">Browse products from merchants and create affiliate links to promote them</p>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search products..."
            className="pl-10"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm min-w-[150px]"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Button onClick={handleSearch} className="bg-teal-600 hover:bg-teal-700">Search</Button>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-72 bg-slate-50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <ShoppingBag className="h-16 w-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No products found</p>
          <p className="text-slate-400 text-sm mt-1">Try a different search or category</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-4">{total} products available</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((p) => (
              <Card key={p.id} className="border-slate-200/60 overflow-hidden hover:shadow-md transition-shadow">
                {/* Image */}
                <div className="aspect-square bg-slate-100 relative">
                  {(p.images as string[])?.length > 0 ? (
                    <img
                      src={(p.images as string[])[0]}
                      alt={p.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ShoppingBag className="h-12 w-12 text-slate-300" />
                    </div>
                  )}
                  {p.hasAffiliateLink && (
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-teal-500 text-white border-0">
                        <Check className="h-3 w-3 mr-1" /> Linked
                      </Badge>
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <p className="font-medium text-slate-900 line-clamp-1">{p.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">by {p.merchantName}</p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-lg font-bold text-slate-900">
                      {Number(p.price).toFixed(2)} <span className="text-sm font-normal text-slate-500">{p.currency}</span>
                    </p>
                    {p.category && (
                      <Badge variant="secondary" className="text-xs">{p.category}</Badge>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">{p.description}</p>
                  )}
                  <div className="mt-3">
                    {p.hasAffiliateLink ? (
                      <Button variant="outline" size="sm" className="w-full" disabled>
                        <Check className="h-4 w-4 mr-1" /> Already Linked
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full bg-teal-600 hover:bg-teal-700"
                        onClick={() => { setLinkDialog(p); setTargetUrl(""); }}
                      >
                        <Link2 className="h-4 w-4 mr-1" /> Create Affiliate Link
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="flex items-center text-sm text-slate-500">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}

      {/* Create Affiliate Link Dialog */}
      <Dialog open={!!linkDialog} onOpenChange={(open) => !open && setLinkDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Affiliate Link</DialogTitle>
          </DialogHeader>
          {linkDialog && (
            <div className="space-y-4">
              <div className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                {(linkDialog.images as string[])?.length > 0 ? (
                  <img src={(linkDialog.images as string[])[0]} alt="" className="w-16 h-16 rounded-lg object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-slate-400" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-slate-900">{linkDialog.title}</p>
                  <p className="text-sm text-slate-500">{Number(linkDialog.price).toFixed(2)} {linkDialog.currency}</p>
                  <p className="text-xs text-slate-400">by {linkDialog.merchantName}</p>
                </div>
              </div>
              <div>
                <Label>Target URL</Label>
                <Input
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://tiktok.com/shop/product or WhatsApp link"
                  type="url"
                />
                <p className="text-xs text-slate-400 mt-1">Where customers will be redirected when they click your link</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setLinkDialog(null)}>Cancel</Button>
                <Button
                  onClick={createAffiliateLink}
                  disabled={!targetUrl || creating}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {creating ? "Creating..." : "Create Link"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
