import { useEffect, useState, useCallback, useRef, type FormEvent, type DragEvent } from "react";
import {
  Package,
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Upload,
  X,
  GripVertical,
  ImagePlus,
  Send,
  Store,
  ShoppingBag,
  Megaphone,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import api from "@/lib/api";

interface Product {
  id: string;
  title: string;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  sku: string | null;
  barcode: string | null;
  currency: string;
  quantity: number;
  images: string[];
  category: string | null;
  tags: string[];
  status: string;
  marketplaceConnection?: { id: string; platform: string; storeName: string } | null;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DRAFT: "bg-amber-50 text-amber-700 border-amber-200",
  ARCHIVED: "bg-slate-100 text-slate-600 border-slate-200",
};

const platformColors: Record<string, string> = {
  SALLA: "bg-indigo-50 text-indigo-700 border-indigo-200",
  SHOPIFY: "bg-green-50 text-green-700 border-green-200",
};

const emptyProduct = {
  title: "",
  description: "",
  price: "",
  compareAtPrice: "",
  sku: "",
  barcode: "",
  currency: "SAR",
  quantity: "0",
  category: "",
  productType: "",
  vendor: "",
  tags: [] as string[],
  weight: "",
  weightUnit: "kg",
  images: [] as string[],
  status: "DRAFT",
};

function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput("");
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      <Label>Tags</Label>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex flex-wrap items-center gap-1.5 min-h-[40px] rounded-md border border-input bg-background px-3 py-2 cursor-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      >
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-md px-2 py-0.5 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="hover:text-teal-900"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => input && addTag(input)}
          placeholder={tags.length === 0 ? "Type a tag and press Enter" : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      <p className="text-xs text-slate-400">Press Enter or comma to add a tag</p>
    </div>
  );
}

function ImageUploadSection({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryFolder, setLibraryFolder] = useState("all");
  const [libraryFolders, setLibraryFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [libraryImages, setLibraryImages] = useState<Array<{ id: string; imageUrl: string; createdAt: string }>>([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (fileArray.length === 0) return;

      fileArray.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            onChange([...images, reader.result]);
          }
        };
        reader.readAsDataURL(file);
      });
    },
    [images, onChange],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);

      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const addUrl = () => {
    const url = urlInput.trim();
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      onChange([...images, url]);
      setUrlInput("");
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const handleReorder = (fromIdx: number, toIdx: number) => {
    const updated = [...images];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    onChange(updated);
  };

  const fetchLibraryFolders = useCallback(() => {
    api.get("/ai-studio/folders")
      .then((res) => setLibraryFolders(res.data || []))
      .catch(() => {});
  }, []);

  const fetchLibraryImages = useCallback((folderId: string) => {
    setLibraryLoading(true);
    api.get("/ai-studio/library", { params: { folderId } })
      .then((res) => setLibraryImages(res.data.data || []))
      .catch(() => toast.error("Failed to load AI Studio images"))
      .finally(() => setLibraryLoading(false));
  }, []);

  const openLibrary = () => {
    setLibraryOpen(true);
    setSelectedLibraryIds(new Set());
    fetchLibraryFolders();
    fetchLibraryImages("all");
  };

  const addUniqueImages = (urls: string[]) => {
    const merged = [...images];
    urls.forEach((url) => {
      if (!merged.includes(url)) merged.push(url);
    });
    onChange(merged);
  };

  const addSelectedLibraryImages = () => {
    const selectedUrls = libraryImages
      .filter((item) => selectedLibraryIds.has(item.id))
      .map((item) => item.imageUrl);
    if (selectedUrls.length === 0) {
      toast.error("Please select image(s)");
      return;
    }
    addUniqueImages(selectedUrls);
    setLibraryOpen(false);
    setSelectedLibraryIds(new Set());
    toast.success(`${selectedUrls.length} image(s) added from AI Studio`);
  };

  const addCurrentFolderImages = () => {
    if (libraryFolder === "all") {
      toast.error("Please choose a specific folder first");
      return;
    }
    if (libraryImages.length === 0) {
      toast.error("No images found in this folder");
      return;
    }
    addUniqueImages(libraryImages.map((item) => item.imageUrl));
    setLibraryOpen(false);
    setSelectedLibraryIds(new Set());
    toast.success(`${libraryImages.length} image(s) added from folder`);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Media</h3>
      <p className="text-xs text-slate-500 mb-3">
        Drag & drop images, browse files, or add by URL
      </p>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
          transition-all duration-200
          ${
            dragging
              ? "border-teal-400 bg-teal-50/60"
              : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-2">
          <div
            className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${
              dragging ? "bg-teal-100" : "bg-slate-100"
            }`}
          >
            <Upload className={`h-5 w-5 ${dragging ? "text-teal-600" : "text-slate-400"}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              {dragging ? "Drop images here" : "Drag & drop images here"}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">or click to browse files</p>
          </div>
        </div>
      </div>

      {/* URL Input */}
      <div className="flex gap-2 mt-3">
        <Input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUrl())}
          placeholder="Or paste image URL and press Enter"
          className="flex-1 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addUrl}
          disabled={!urlInput.trim()}
          className="shrink-0"
        >
          <ImagePlus className="h-4 w-4 mr-1" />
          Add
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openLibrary}
          className="shrink-0"
        >
          <ImagePlus className="h-4 w-4 mr-1" />
          From AI Studio
        </Button>
      </div>

      {/* Image Previews */}
      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {images.map((src, i) => (
            <div
              key={i}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIdx !== null && dragIdx !== i) {
                  handleReorder(dragIdx, i);
                  setDragIdx(i);
                }
              }}
              onDragEnd={() => setDragIdx(null)}
              className={`
                group relative aspect-square rounded-lg border overflow-hidden bg-slate-50
                transition-all duration-150
                ${dragIdx === i ? "opacity-50 scale-95" : "border-slate-200"}
              `}
            >
              <img
                src={src}
                alt={`Image ${i + 1}`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' fill='%23cbd5e1'%3E%3Crect width='80' height='80' fill='%23f1f5f9'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-size='10' fill='%2394a3b8'%3EBroken%3C/text%3E%3C/svg%3E";
                }}
              />
              {/* Drag handle */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="h-6 w-6 rounded bg-black/50 flex items-center justify-center cursor-grab">
                  <GripVertical className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
              {/* Remove button */}
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600"
              >
                <X className="h-3.5 w-3.5 text-white" />
              </button>
              {/* First image badge */}
              {i === 0 && (
                <div className="absolute bottom-1 left-1">
                  <span className="text-[10px] font-medium bg-teal-600 text-white px-1.5 py-0.5 rounded">
                    Cover
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select from AI Studio</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-3">
            <Select
              value={libraryFolder}
              onValueChange={(v) => {
                setLibraryFolder(v);
                setSelectedLibraryIds(new Set());
                fetchLibraryImages(v);
              }}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Media</SelectItem>
                {libraryFolders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCurrentFolderImages}
              disabled={libraryFolder === "all" || libraryImages.length === 0}
            >
              Add Folder
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={addSelectedLibraryImages}
              disabled={selectedLibraryIds.size === 0}
            >
              Add Selected ({selectedLibraryIds.size})
            </Button>
          </div>
          {libraryLoading ? (
            <div className="p-8 text-center text-slate-500">Loading images...</div>
          ) : libraryImages.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No images found in this folder</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {libraryImages.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedLibraryIds);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    setSelectedLibraryIds(next);
                  }}
                  className={`group text-left border rounded-lg overflow-hidden ${
                    selectedLibraryIds.has(item.id)
                      ? "border-teal-400 ring-2 ring-teal-200"
                      : "border-slate-200 hover:border-teal-300"
                  }`}
                >
                  <img src={item.imageUrl} alt="AI Studio" className="h-36 w-full object-cover bg-slate-50" />
                  <div className="p-2">
                    <p className="text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                    <p className="text-xs text-teal-700 mt-1">
                      {selectedLibraryIds.has(item.id) ? "Selected" : "Click to select"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface MarketplaceConn {
  id: string;
  platform: string;
  storeName: string;
  status: string;
}

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [aiCredits, setAiCredits] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [connections, setConnections] = useState<MarketplaceConn[]>([]);
  const [pushing, setPushing] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceProgress, setEnhanceProgress] = useState("");
  const [enhanceBackground, setEnhanceBackground] = useState("studio");

  // Advertise state
  const [advertiseProduct, setAdvertiseProduct] = useState<Product | null>(null);
  const [creators, setCreators] = useState<any[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState<any | null>(null);
  const [brief, setBrief] = useState("");
  const [nicheFilter, setNicheFilter] = useState("all");
  const [sendingRequest, setSendingRequest] = useState(false);

  const creditClassName = aiCredits === null
    ? "text-teal-700"
    : aiCredits <= 0
      ? "text-red-600"
      : aiCredits <= 5
        ? "text-amber-600"
        : "text-teal-700";

  const openAdvertise = (product: Product) => {
    setAdvertiseProduct(product);
    setSelectedCreator(null);
    setBrief("");
    setNicheFilter("all");
    setCreatorsLoading(true);
    api.get("/creators", { params: { limit: "50", sort: "followers" } })
      .then((res) => setCreators(res.data.data))
      .catch(() => {})
      .finally(() => setCreatorsLoading(false));
  };

  const fetchCreatorsFiltered = (niche: string) => {
    setNicheFilter(niche);
    setCreatorsLoading(true);
    const params: Record<string, string> = { limit: "50", sort: "followers" };
    if (niche !== "all") params.niche = niche;
    api.get("/creators", { params })
      .then((res) => setCreators(res.data.data))
      .catch(() => {})
      .finally(() => setCreatorsLoading(false));
  };

  const handleSendRequest = async () => {
    if (!advertiseProduct || !selectedCreator || !brief.trim()) {
      toast.error("Please select a creator and write a brief");
      return;
    }
    setSendingRequest(true);
    try {
      await api.post("/campaigns", { productId: advertiseProduct.id, creatorId: selectedCreator.userId, brief });
      toast.success("Campaign request sent!");
      setAdvertiseProduct(null);
      setSelectedCreator(null);
      setBrief("");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to send request");
    } finally { setSendingRequest(false); }
  };

  const handleEnhanceAllImages = async () => {
    if (form.images.length === 0) {
      toast.error("Please upload at least one image first");
      return;
    }
    setEnhancing(true);
    const newImages = [...form.images];
    let enhanced = 0;
    try {
      for (let i = 0; i < newImages.length; i++) {
        setEnhanceProgress(`Enhancing image ${i + 1} of ${newImages.length}...`);
        const res = await api.post("/products/enhance-image", {
          image: newImages[i],
          title: form.title,
          description: form.description,
          background: enhanceBackground
        });
        newImages[i] = res.data.image;
        if (typeof res.data?.remainingCredits === "number") {
          setAiCredits(res.data.remainingCredits);
        }
        enhanced++;
      }
      setForm({ ...form, images: newImages });
      toast.success(`${enhanced} image(s) enhanced successfully!`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to enhance images.";
      toast.error(message);
      // Still save whatever we managed to enhance
      if (enhanced > 0) {
        setForm({ ...form, images: newImages });
      }
    } finally {
      setEnhancing(false);
      setEnhanceProgress("");
    }
  };
  
  const pageSize = 20;

  const fetchProducts = () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
    if (search) params.search = search;
    if (statusFilter !== "all") params.status = statusFilter;
    if (marketplaceFilter !== "all") params.marketplace = marketplaceFilter;

    api
      .get("/products", { params })
      .then((res) => {
        setProducts(res.data.data);
        setTotal(res.data.total);
      })
      .catch(() => toast.error("Failed to load products"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get("/marketplaces").then((res) => {
      setConnections(res.data.filter((c: MarketplaceConn) => c.status === "CONNECTED"));
    }).catch(() => {});
    api.get("/user/ai-credits")
      .then((res) => setAiCredits(res.data.remainingCredits))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [page, statusFilter, marketplaceFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm(emptyProduct);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      title: product.title,
      description: product.description || "",
      price: String(product.price),
      compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      currency: product.currency,
      quantity: String(product.quantity),
      category: product.category || "",
      productType: (product as Record<string, unknown>).productType as string || "",
      vendor: (product as Record<string, unknown>).vendor as string || "",
      tags: Array.isArray(product.tags) ? product.tags : [],
      weight: (product as Record<string, unknown>).weight ? String((product as Record<string, unknown>).weight) : "",
      weightUnit: ((product as Record<string, unknown>).weightUnit as string) || "kg",
      images: Array.isArray(product.images) ? (product.images as string[]) : [],
      status: product.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || null,
        price: parseFloat(form.price),
        compareAtPrice: form.compareAtPrice ? parseFloat(form.compareAtPrice) : null,
        sku: form.sku || null,
        barcode: form.barcode || null,
        currency: form.currency,
        quantity: parseInt(form.quantity),
        category: form.category || null,
        productType: form.productType || null,
        vendor: form.vendor || null,
        tags: form.tags.filter(Boolean),
        weight: form.weight ? parseFloat(form.weight) : null,
        weightUnit: form.weightUnit || "kg",
        images: form.images.filter(Boolean),
        status: form.status,
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/products", payload);
        toast.success("Product created");
      }
      setDialogOpen(false);
      fetchProducts();
    } catch {
      toast.error("Failed to save product");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/products/${id}`);
      toast.success("Product deleted");
      fetchProducts();
    } catch {
      toast.error("Failed to delete product");
    }
  };

  const handleBulkAction = async (action: string) => {
    try {
      await api.patch("/products/bulk", { ids: Array.from(selectedIds), action });
      toast.success(`Bulk ${action} completed`);
      setSelectedIds(new Set());
      fetchProducts();
    } catch {
      toast.error("Bulk action failed");
    }
  };

  const handlePush = async (productIds: string[], connectionId: string) => {
    setPushing(true);
    try {
      const res = await api.post("/products/push", { productIds, connectionId });
      toast.success(res.data.message);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to push products";
      toast.error(message);
    } finally {
      setPushing(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
          <p className="text-slate-500 text-sm mt-1">{total} products total</p>
          <p className={`text-sm mt-1 font-medium ${creditClassName}`}>
            AI Credits: {aiCredits ?? "—"} / 50 (resets every Monday)
          </p>
          {aiCredits !== null && aiCredits <= 0 && (
            <p className="text-xs text-red-600 mt-1">
              You have exhausted your weekly AI credits. Credits will reset on Monday.
            </p>
          )}
        </div>
        <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={marketplaceFilter} onValueChange={(v) => { setMarketplaceFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Marketplace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Marketplaces</SelectItem>
            <SelectItem value="SALLA">Salla</SelectItem>
            <SelectItem value="SHOPIFY">Shopify</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-3 bg-teal-50 rounded-lg border border-teal-200">
          <span className="text-sm font-medium text-teal-800">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2 ml-4">
            <Button size="sm" variant="outline" onClick={() => handleBulkAction("activate")}>
              Set Active
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkAction("draft")}>
              Set Draft
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBulkAction("archive")}>
              Archive
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => handleBulkAction("delete")}
            >
              Delete
            </Button>
            {connections.length > 0 && (
              <div className="h-5 w-px bg-teal-200 mx-1" />
            )}
            {connections.map((conn) => (
              <Button
                key={conn.id}
                size="sm"
                variant="outline"
                className="text-teal-700 border-teal-300 hover:bg-teal-100"
                disabled={pushing}
                onClick={() => handlePush(Array.from(selectedIds), conn.id)}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Push to {conn.storeName}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="border-slate-200/60">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 bg-slate-50 rounded animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <Package className="h-16 w-16 text-slate-200 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-700">No products yet</h3>
              <p className="text-slate-400 text-sm mt-1 mb-4">
                Add products manually or sync from a connected marketplace
              </p>
              <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === products.length && products.length > 0}
                      onChange={toggleAll}
                      className="rounded border-slate-300"
                    />
                  </TableHead>
                  <TableHead className="w-16">Image</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        className="rounded border-slate-300"
                      />
                    </TableCell>
                    <TableCell>
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0] as string}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover bg-slate-100"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                          <Package className="h-4 w-4 text-slate-300" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-800 truncate max-w-[200px]">
                        {product.title}
                      </p>
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {product.sku || "—"}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {Number(product.price).toFixed(2)} {product.currency}
                    </TableCell>
                    <TableCell className="text-slate-600">{product.quantity}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors[product.status] || ""}
                      >
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {product.marketplaceConnection ? (
                        <Badge
                          variant="outline"
                          className={platformColors[product.marketplaceConnection.platform] || ""}
                        >
                          {product.marketplaceConnection.platform}
                        </Badge>
                      ) : (
                        <span className="text-sm text-slate-400">Manual</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(product)} className="cursor-pointer">
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {connections.length > 0 && <DropdownMenuSeparator />}
                          {connections.map((conn) => (
                            <DropdownMenuItem
                              key={conn.id}
                              onClick={() => handlePush([product.id], conn.id)}
                              className="cursor-pointer"
                              disabled={pushing}
                            >
                              {conn.platform === "SHOPIFY" ? (
                                <ShoppingBag className="mr-2 h-4 w-4 text-green-600" />
                              ) : (
                                <Store className="mr-2 h-4 w-4 text-indigo-600" />
                              )}
                              Push to {conn.storeName}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openAdvertise(product)}
                            className="cursor-pointer"
                          >
                            <Megaphone className="mr-2 h-4 w-4 text-teal-600" />
                            Advertise
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(product.id)}
                            className="text-red-600 cursor-pointer"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Basic Information</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Short sleeve t-shirt"
                      required
                      maxLength={255}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Status *</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="DRAFT">Draft</SelectItem>
                        <SelectItem value="ARCHIVED">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Describe your product in detail..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    maxLength={5000}
                  />
                </div>
                <TagInput
                  tags={form.tags}
                  onChange={(tags) => setForm({ ...form, tags })}
                />
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Media */}
            <ImageUploadSection
              images={form.images}
              onChange={(images) => setForm({ ...form, images })}
            />

            {/* AI Enhancement Button */}
            {form.images.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleEnhanceAllImages}
                    disabled={enhancing}
                    className="flex-1 border-teal-200 text-teal-700 hover:bg-teal-50 hover:border-teal-300 transition-all"
                  >
                    {enhancing ? (
                      <>
                        <svg className="animate-spin h-4 w-4 mr-2 text-teal-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {enhanceProgress || "Enhancing..."}
                      </>
                    ) : (
                      <>
                        <ImagePlus className="h-4 w-4 mr-2" />
                        AI Enhancement
                      </>
                    )}
                  </Button>
                  <Select value={enhanceBackground} onValueChange={setEnhanceBackground}>
                    <SelectTrigger className="w-[150px] border-teal-200 text-teal-700">
                      <SelectValue placeholder="Background" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="studio">Studio</SelectItem>
                      <SelectItem value="kitchen">Kitchen</SelectItem>
                      <SelectItem value="mall">Mall</SelectItem>
                      <SelectItem value="outdoor">Outdoor</SelectItem>
                      <SelectItem value="living_room">Living Room</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="nature">Nature</SelectItem>
                      <SelectItem value="gradient">Gradient</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

              </div>
            )}

            <hr className="border-slate-200" />

            {/* Pricing */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Pricing</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Price *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Compare-at Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.compareAtPrice}
                    onChange={(e) => setForm({ ...form, compareAtPrice: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency *</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SAR">SAR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                      <SelectItem value="KWD">KWD</SelectItem>
                      <SelectItem value="BHD">BHD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Inventory */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Inventory</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>SKU (Stock Keeping Unit)</Label>
                  <Input
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="SKU-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Barcode (ISBN, UPC, GTIN)</Label>
                  <Input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="123456789012"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Shipping */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Shipping</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Weight</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.weight}
                    onChange={(e) => setForm({ ...form, weight: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Weight Unit</Label>
                  <Select value={form.weightUnit} onValueChange={(v) => setForm({ ...form, weightUnit: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Organization */}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Organization</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Product Type</Label>
                  <Input
                    value={form.productType}
                    onChange={(e) => setForm({ ...form, productType: e.target.value })}
                    placeholder="e.g. T-Shirt, Perfume, Electronics"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vendor / Brand</Label>
                  <Input
                    value={form.vendor}
                    onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    placeholder="e.g. Nike, Apple, Local Brand"
                  />
                </div>
              </div>
              <div className="space-y-2 mt-3">
                <Label>Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Clothing, Home & Garden"
                />
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 text-white"
                disabled={saving}
              >
                {saving ? "Saving..." : editingProduct ? "Update Product" : "Create Product"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Advertise Dialog */}
      <Dialog open={!!advertiseProduct} onOpenChange={() => { setAdvertiseProduct(null); setSelectedCreator(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCreator ? "Send Campaign Request" : "Choose a Creator"}</DialogTitle>
            {advertiseProduct && <p className="text-sm text-slate-500">For: {advertiseProduct.title}</p>}
          </DialogHeader>

          {!selectedCreator ? (
            <div>
              <div className="flex gap-2 mb-4">
                <Select value={nicheFilter} onValueChange={fetchCreatorsFiltered}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="All Niches" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Niches</SelectItem>
                    {["Fashion", "Tech", "Food", "Lifestyle", "Beauty", "Sports", "Travel", "Education", "Entertainment", "Other"].map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {creatorsLoading ? (
                <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-48 bg-slate-50 rounded-lg animate-pulse" />)}</div>
              ) : creators.length === 0 ? (
                <p className="text-center text-slate-400 py-8">No creators available</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {creators.map((creator: any) => {
                    const initials = creator.displayName?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
                    const formatFollowers = (n: number) => n >= 1000 ? `${Math.floor(n / 1000)}K` : String(n);
                    return (
                      <div key={creator.id} className="border border-slate-200 rounded-xl p-4 text-center hover:border-teal-300 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-blue-500 mx-auto mb-2 flex items-center justify-center text-white font-semibold">{initials}</div>
                        <p className="font-semibold text-slate-900 text-sm">{creator.displayName}</p>
                        <p className="text-xs text-teal-600">{creator.niche}</p>
                        <div className="flex justify-center gap-2 mt-2 text-xs text-slate-500">
                          {(creator.socialPlatforms || []).slice(0, 2).map((s: any, i: number) => (
                            <span key={i}>{s.platform === "instagram" ? "📸" : s.platform === "tiktok" ? "🎵" : s.platform === "youtube" ? "📺" : "📱"} {formatFollowers(s.followerCount)}</span>
                          ))}
                        </div>
                        <p className="font-semibold text-slate-900 text-sm mt-2">{creator.rate} SAR</p>
                        <Button size="sm" className="mt-2 w-full bg-teal-600 hover:bg-teal-700 text-white text-xs" onClick={() => setSelectedCreator(creator)}>Select Creator</Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setSelectedCreator(null)} className="text-slate-500 -ml-2">← Back to creators</Button>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Product</p>
                  <p className="font-medium text-sm text-slate-900">{advertiseProduct?.title}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Creator</p>
                  <p className="font-medium text-sm text-slate-900">{selectedCreator.displayName}</p>
                  <p className="text-xs text-slate-500">{selectedCreator.niche}</p>
                </div>
              </div>
              <div className="flex justify-between items-center p-3 bg-teal-50 rounded-lg">
                <span className="text-sm text-teal-700">Campaign Cost</span>
                <span className="font-bold text-teal-700">{selectedCreator.rate} SAR</span>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Brief / Instructions</label>
                <textarea placeholder="Describe what you'd like the creator to highlight..." value={brief} onChange={(e) => setBrief(e.target.value)}
                  className="flex min-h-[100px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2" rows={4} />
              </div>
              <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={sendingRequest || !brief.trim()} onClick={handleSendRequest}>
                {sendingRequest ? "Sending..." : "Send Request & Pay"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
