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
  Sparkles,
  Loader2,
  FileUp,
  Download,
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
import { useTranslation } from "react-i18next";
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
  productType: string | null;
  vendor: string | null;
  weight: number | null;
  weightUnit: string | null;
  marketplaceConnection?: { id: string; platform: string; storeName: string } | null;
  createdAt: string;
  updatedAt: string;
}

const backgroundOptions = [
  { value: "studio", label: "Studio" },
  { value: "kitchen", label: "Kitchen" },
  { value: "mall", label: "Mall" },
  { value: "outdoor", label: "Outdoor" },
  { value: "living_room", label: "Living Room" },
  { value: "office", label: "Office" },
  { value: "nature", label: "Nature" },
  { value: "gradient", label: "Gradient" },
];

// Minimal RFC4180-ish CSV parser — handles quoted fields, escaped quotes, and
// commas-inside-quotes. Good enough for merchant spreadsheets exported from
// Excel/Google Sheets. Returns an array of rows (each row is an array of cells).
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") { /* ignore */ }
      else { cell += ch; }
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Accepted header names (case-insensitive), aliased to canonical keys
const CSV_HEADER_ALIASES: Record<string, string> = {
  title: "title", name: "title", product: "title", "product name": "title",
  price: "price", cost: "price",
  quantity: "quantity", qty: "quantity", stock: "quantity", inventory: "quantity",
  sku: "sku",
  currency: "currency",
  status: "status",
  description: "description", desc: "description",
  compareatprice: "compareAtPrice", "compare at price": "compareAtPrice", "compare price": "compareAtPrice", msrp: "compareAtPrice",
  category: "category",
  producttype: "productType", "product type": "productType", type: "productType",
  vendor: "vendor", brand: "vendor",
  tags: "tags",
  imageurl: "imageUrl", image: "imageUrl", "image url": "imageUrl", photo: "imageUrl",
};

function rowsToImportJSON(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => {
    const key = h.trim().toLowerCase();
    return CSV_HEADER_ALIASES[key] || "";
  });
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((key, i) => {
      if (key && r[i] !== undefined) obj[key] = r[i].trim();
    });
    return obj;
  });
}

const CSV_TEMPLATE = "title,price,quantity,sku,status,description,imageUrl,category,vendor,tags\n" +
  "Example Product,99.00,10,SKU-001,DRAFT,\"Soft cotton t-shirt, unisex\",https://example.com/img.jpg,Apparel,Acme,\"summer,cotton\"\n";

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
  onOpenStudioPicker,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  onOpenStudioPicker?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
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

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Media</h3>
      <p className="text-xs text-slate-500 mb-3">
        Upload your own photos, add by URL, or pick from your AI Studio library
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
          ${dragging
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
            className={`h-10 w-10 rounded-full flex items-center justify-center transition-colors ${dragging ? "bg-teal-100" : "bg-slate-100"
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

      {/* AI Studio picker — first-class action, visually distinct from the
          URL input below so merchants find it even on narrow dialogs. */}
      {onOpenStudioPicker && (
        <Button
          type="button"
          variant="outline"
          onClick={onOpenStudioPicker}
          className="w-full mt-3 border-teal-200 bg-teal-50/30 text-teal-700 hover:bg-teal-50 hover:border-teal-300 justify-center"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Pick from AI Studio library
        </Button>
      )}

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
  const { t } = useTranslation();
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

  // AI Studio picker state
  const [studioPickerOpen, setStudioPickerOpen] = useState(false);
  const [studioImages, setStudioImages] = useState<Array<{ id: string; imageUrl: string; background?: string; folder?: { id: string; name: string } | null }>>([]);
  const [studioFolders, setStudioFolders] = useState<Array<{ id: string; name: string; _count: { images: number } }>>([]);
  const [studioFolderFilter, setStudioFolderFilter] = useState("all");
  const [studioPickerLoading, setStudioPickerLoading] = useState(false);
  const [studioSelected, setStudioSelected] = useState<Set<string>>(new Set());
  const [, setStudioSearch] = useState("");

  // CSV bulk import state
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importZipFile, setImportZipFile] = useState<File | null>(null);
  const [importZipError, setImportZipError] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const importZipRef = useRef<HTMLInputElement>(null);

  // Enhance existing product (from marketplace sync or manual) state
  const [enhanceProduct, setEnhanceProduct] = useState<Product | null>(null);
  const [enhanceProductScene, setEnhanceProductScene] = useState("studio");
  const [enhanceProductSceneText, setEnhanceProductSceneText] = useState("");
  const [enhanceProductRunning, setEnhanceProductRunning] = useState(false);

  // Product detail view state — read-only drawer opened by clicking a row's title
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);

  // Bulk enhance (multiple products at once) state
  const [bulkEnhanceOpen, setBulkEnhanceOpen] = useState(false);
  const [bulkEnhanceScene, setBulkEnhanceScene] = useState("studio");
  const [bulkEnhanceSceneText, setBulkEnhanceSceneText] = useState("");
  const [bulkEnhanceMode, setBulkEnhanceMode] = useState<"prepend" | "overwrite" | "new">("prepend");
  const [bulkEnhanceRunning, setBulkEnhanceRunning] = useState(false);
  const [bulkEnhanceProgress, setBulkEnhanceProgress] = useState<{ done: number; total: number } | null>(null);

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
      .catch(() => { })
      .finally(() => setCreatorsLoading(false));
  };

  const fetchCreatorsFiltered = (niche: string) => {
    setNicheFilter(niche);
    setCreatorsLoading(true);
    const params: Record<string, string> = { limit: "50", sort: "followers" };
    if (niche !== "all") params.niche = niche;
    api.get("/creators", { params })
      .then((res) => setCreators(res.data.data))
      .catch(() => { })
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

  const openStudioPicker = () => {
    setStudioPickerOpen(true);
    setStudioSelected(new Set());
    setStudioFolderFilter("all");
    setStudioSearch("");
    setStudioPickerLoading(true);
    Promise.all([
      api.get("/ai-studio/folders"),
      api.get("/ai-studio/library", { params: { folderId: "all" } }),
    ])
      .then(([foldersRes, imagesRes]) => {
        setStudioFolders(foldersRes.data);
        setStudioImages(imagesRes.data.data);
      })
      .catch(() => toast.error("Failed to load AI Studio media"))
      .finally(() => setStudioPickerLoading(false));
  };

  const loadStudioFolder = (folderId: string) => {
    setStudioFolderFilter(folderId);
    setStudioPickerLoading(true);
    api.get("/ai-studio/library", { params: { folderId } })
      .then((res) => setStudioImages(res.data.data))
      .catch(() => toast.error("Failed to load folder"))
      .finally(() => setStudioPickerLoading(false));
  };

  const addStudioImages = () => {
    const urls = studioImages
      .filter((img) => studioSelected.has(img.id))
      .map((img) => img.imageUrl);
    setForm((prev) => ({ ...prev, images: [...prev.images, ...urls] }));
    setStudioPickerOpen(false);
    setStudioSelected(new Set());
  };

  const handleEnhanceAllImages = async () => {
    const base64Images = form.images.filter((img) => img.startsWith("data:"));
    if (base64Images.length === 0) {
      toast.error("Upload images from your device first to enhance them");
      return;
    }
    setEnhancing(true);
    const newImages = [...form.images];
    let enhanced = 0;
    let base64Idx = 0;
    try {
      for (let i = 0; i < newImages.length; i++) {
        if (!newImages[i].startsWith("data:")) continue;
        base64Idx++;
        setEnhanceProgress(`Enhancing image ${base64Idx} of ${base64Images.length}...`);
        const res = await api.post("/ai-studio/enhance", {
          image: newImages[i],
          background: enhanceBackground,
          folderId: null,
        }, { timeout: 120000 });
        newImages[i] = res.data.imageUrl;
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
    }).catch(() => { });
    api.get("/user/ai-credits")
      .then((res) => setAiCredits(res.data.remainingCredits))
      .catch(() => { });

    // Handle hand-off from AI Studio "Create product from selection": open
    // the Add Product dialog pre-populated with the image URLs we parked in
    // sessionStorage. Consume the key so a refresh doesn't re-trigger.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("new") === "1") {
        try {
          const raw = sessionStorage.getItem("tijarflow_prefill_product_images");
          if (raw) {
            const urls = JSON.parse(raw) as unknown;
            if (Array.isArray(urls) && urls.every((x) => typeof x === "string")) {
              sessionStorage.removeItem("tijarflow_prefill_product_images");
              setEditingProduct(null);
              setForm({ ...emptyProduct, images: urls as string[] });
              setDialogOpen(true);
              // Drop the query string so a refresh doesn't re-open
              window.history.replaceState({}, "", "/products");
            }
          }
        } catch { /* non-critical */ }
      }
    }
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
      productType: product.productType || "",
      vendor: product.vendor || "",
      tags: Array.isArray(product.tags) ? product.tags : [],
      weight: product.weight ? String(product.weight) : "",
      weightUnit: product.weightUnit || "kg",
      images: Array.isArray(product.images) ? product.images : [],
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

  const openDetail = (product: Product) => {
    setDetailProduct(product);
    setDetailImageIndex(0);
  };

  const openImport = () => {
    setImportOpen(true);
    setImportRows([]);
    setImportFileName("");
    setImportError("");
    setImportZipFile(null);
    setImportZipError("");
  };

  const handleImportZip = (file: File) => {
    setImportZipError("");
    if (file.size > 100 * 1024 * 1024) {
      setImportZipError("ZIP is too large (max 100 MB)");
      setImportZipFile(null);
      return;
    }
    if (!/\.zip$/i.test(file.name)) {
      setImportZipError("File must be a .zip");
      setImportZipFile(null);
      return;
    }
    setImportZipFile(file);
  };

  const handleImportFile = async (file: File) => {
    setImportError("");
    setImportFileName(file.name);
    if (file.size > 5 * 1024 * 1024) {
      setImportError("File is too large (max 5 MB)");
      setImportRows([]);
      return;
    }
    try {
      const text = await file.text();
      const raw = parseCSV(text);
      const parsed = rowsToImportJSON(raw);
      if (parsed.length === 0) {
        setImportError("No data rows found. Make sure the first row is the header (title, price, ...).");
        setImportRows([]);
        return;
      }
      if (parsed.length > 500) {
        setImportError(`Too many rows (${parsed.length}). Max 500 per import — split the file.`);
        setImportRows([]);
        return;
      }
      if (!parsed.some((r) => r.title)) {
        setImportError("Couldn't find a 'title' column. Rename your column to 'title' or 'name'.");
        setImportRows([]);
        return;
      }
      setImportRows(parsed);
    } catch {
      setImportError("Couldn't read the file. Make sure it's a valid CSV.");
      setImportRows([]);
    }
  };

  const runImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    try {
      let res;
      if (importZipFile) {
        const fd = new FormData();
        fd.append("rows", JSON.stringify(importRows));
        fd.append("zip", importZipFile);
        res = await api.post("/products/bulk-import", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        res = await api.post("/products/bulk-import", { rows: importRows });
      }
      const { created, errors, total, photos } = res.data as {
        created: number;
        errors: { row: number; error: string }[];
        total: number;
        photos?: { matched: number; unmatched: string[]; invalid: string[] } | null;
      };
      const photoSuffix = photos ? ` · ${photos.matched} photo(s) matched` : "";
      if (errors.length > 0) {
        toast.success(`Imported ${created} of ${total} — ${errors.length} row(s) had errors.${photoSuffix}`);
      } else {
        toast.success(`Imported ${created} product(s)${photoSuffix}`);
      }
      if (photos && (photos.unmatched.length > 0 || photos.invalid.length > 0)) {
        const lines: string[] = [];
        if (photos.unmatched.length) lines.push(`${photos.unmatched.length} photo(s) had no matching SKU`);
        if (photos.invalid.length) lines.push(`${photos.invalid.length} file(s) weren't valid images`);
        toast.warning(lines.join(" · "));
      }
      setImportOpen(false);
      setImportRows([]);
      setImportFileName("");
      setImportZipFile(null);
      fetchProducts();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to import products";
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tijarflow-products-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openEnhanceProduct = (product: Product) => {
    setEnhanceProduct(product);
    setEnhanceProductScene("studio");
    setEnhanceProductSceneText("");
  };

  const runEnhanceProduct = async () => {
    if (!enhanceProduct) return;
    setEnhanceProductRunning(true);
    try {
      const res = await api.post(`/products/${enhanceProduct.id}/enhance`, {
        scene: enhanceProductScene,
        sceneText: enhanceProductSceneText.trim() || undefined,
      });
      toast.success("Enhanced image added to this product");
      if (typeof res.data?.remainingCredits === "number") setAiCredits(res.data.remainingCredits);
      setEnhanceProduct(null);
      fetchProducts();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Failed to enhance product image";
      toast.error(message);
    } finally {
      setEnhanceProductRunning(false);
    }
  };

  const openBulkEnhance = () => {
    setBulkEnhanceScene("studio");
    setBulkEnhanceSceneText("");
    setBulkEnhanceMode("prepend");
    setBulkEnhanceProgress(null);
    setBulkEnhanceOpen(true);
  };

  const runBulkEnhance = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkEnhanceRunning(true);
    setBulkEnhanceProgress({ done: 0, total: ids.length });
    // The endpoint runs server-side with concurrency internally, so the
    // progress bar here is a simple "submitting..." indicator until the
    // final counts come back. For a better UX we'd stream progress (SSE),
    // but a one-shot request keeps the contract simple and matches the
    // single-enhance endpoint.
    const toastId = toast.loading(`Enhancing ${ids.length} product(s)... This may take a few minutes.`);
    try {
      const res = await api.post("/products/bulk-enhance", {
        productIds: ids,
        scene: bulkEnhanceScene,
        mode: bulkEnhanceMode,
        sceneText: bulkEnhanceSceneText.trim() || undefined,
      });
      const { succeeded, failed, remainingCredits } = res.data as {
        succeeded: { productId: string }[];
        failed: { productId: string; error: string }[];
        remainingCredits: number;
      };
      toast.dismiss(toastId);
      if (typeof remainingCredits === "number") setAiCredits(remainingCredits);
      if (failed.length === 0) {
        toast.success(`Enhanced ${succeeded.length} product(s)`);
      } else if (succeeded.length === 0) {
        toast.error(`All ${failed.length} enhancement(s) failed — see console for details`);
        console.error("Bulk enhance failures:", failed);
      } else {
        toast.warning(`Enhanced ${succeeded.length} · ${failed.length} failed — see console for details`);
        console.warn("Bulk enhance partial failures:", failed);
      }
      setBulkEnhanceOpen(false);
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err: unknown) {
      toast.dismiss(toastId);
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Bulk enhancement failed";
      toast.error(message);
    } finally {
      setBulkEnhanceRunning(false);
      setBulkEnhanceProgress(null);
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
          <h1 className="text-2xl font-semibold text-slate-900">{t("products.title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{total} · {t("products.subtitle")}</p>
          <p className={`text-sm mt-1 font-medium ${creditClassName}`}>
            AI Credits: {aiCredits ?? "—"} / 30 (resets on the 1st of each month)
          </p>
          {aiCredits !== null && aiCredits <= 0 && (
            <p className="text-xs text-red-600 mt-1">
              You have exhausted your monthly AI credits. Credits will reset on the 1st of next month.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openImport}>
            <FileUp className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button onClick={openCreate} className="bg-teal-600 hover:bg-teal-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            {t("products.addProduct")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder={t("products.search")}
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
            <SelectItem value="all">{t("products.status.all")}</SelectItem>
            <SelectItem value="ACTIVE">{t("products.status.active")}</SelectItem>
            <SelectItem value="DRAFT">{t("products.status.draft")}</SelectItem>
            <SelectItem value="ARCHIVED">{t("products.status.archived")}</SelectItem>
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
            <div className="h-5 w-px bg-teal-200 mx-1" />
            <Button
              size="sm"
              variant="outline"
              className="text-amber-700 border-amber-200 bg-white hover:bg-amber-50"
              onClick={openBulkEnhance}
              disabled={bulkEnhanceRunning || selectedIds.size > 50}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
              Enhance with AI ({selectedIds.size})
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
              <h3 className="text-lg font-medium text-slate-700">{t("products.empty")}</h3>
              <p className="text-slate-400 text-sm mt-1 mb-4">
                {t("products.emptyHint")}
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
                        <button type="button" onClick={() => openDetail(product)} className="block">
                          <img
                            src={product.images[0] as string}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover bg-slate-100 hover:ring-2 hover:ring-teal-300 transition-all"
                          />
                        </button>
                      ) : (
                        <button type="button" onClick={() => openDetail(product)} className="h-10 w-10 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                          <Package className="h-4 w-4 text-slate-300" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 max-w-[220px]">
                        <button
                          type="button"
                          onClick={() => openDetail(product)}
                          className="font-medium text-slate-800 truncate hover:text-teal-700 hover:underline text-left"
                        >
                          {product.title}
                        </button>
                        {product.tags?.includes("ai-enhanced") && (
                          <span
                            title="Generated with AI Studio"
                            className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-gradient-to-r from-amber-50 to-fuchsia-50 text-amber-700 border border-amber-200"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            AI
                          </span>
                        )}
                      </div>
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
                            onClick={() => openEnhanceProduct(product)}
                            className="cursor-pointer"
                            disabled={!product.images?.length}
                          >
                            <Sparkles className="mr-2 h-4 w-4 text-amber-500" />
                            Enhance with AI
                          </DropdownMenuItem>
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
              onOpenStudioPicker={openStudioPicker}
            />

            {/* AI Enhancement */}
            {form.images.length > 0 && (
              <div className="p-3 rounded-lg border border-teal-100 bg-teal-50/40 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    <span className="text-xs font-semibold text-teal-800">AI Enhancement</span>
                  </div>
                  <span className={`text-xs font-medium ${creditClassName}`}>
                    {aiCredits ?? "—"} / 30 credits
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleEnhanceAllImages}
                    disabled={enhancing || !form.images.some((img) => img.startsWith("data:")) || (aiCredits !== null && aiCredits <= 0)}
                    className="flex-1 border-teal-200 text-teal-700 hover:bg-teal-50 hover:border-teal-300 transition-all"
                  >
                    {enhancing ? (
                      <>
                        <Loader2 className="animate-spin h-4 w-4 mr-2 text-teal-600" />
                        {enhanceProgress || "Enhancing..."}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Enhance All
                      </>
                    )}
                  </Button>
                  <Select value={enhanceBackground} onValueChange={setEnhanceBackground}>
                    <SelectTrigger className="w-[150px] border-teal-200 text-teal-700">
                      <SelectValue placeholder="Background" />
                    </SelectTrigger>
                    <SelectContent>
                      {backgroundOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!form.images.some((img) => img.startsWith("data:")) && (
                  <p className="text-[11px] text-slate-400 italic">Upload images from your device to enable enhancement</p>
                )}
                {aiCredits !== null && aiCredits <= 0 && (
                  <p className="text-[11px] text-red-500">No credits remaining. Resets on the 1st of each month.</p>
                )}
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

      {/* AI Studio Picker Dialog */}
      <Dialog open={studioPickerOpen} onOpenChange={(open) => { if (!open) { setStudioPickerOpen(false); setStudioSelected(new Set()); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Pick from AI Studio</h2>
              <p className="text-xs text-slate-400 mt-0.5">Select images to add to your product</p>
            </div>
            {studioSelected.size > 0 && (
              <span className="text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-full">
                {studioSelected.size} selected
              </span>
            )}
          </div>

          {/* Folder tab bar */}
          <div className="px-6 pt-3 pb-0 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
              {[{ id: "all", name: "All Media", count: studioImages.length }, ...studioFolders.map((f) => ({ id: f.id, name: f.name, count: f._count.images }))].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => loadStudioFolder(tab.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                    studioFolderFilter === tab.id
                      ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                      : "bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50"
                  }`}
                >
                  {tab.name}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-normal ${studioFolderFilter === tab.id ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-400"}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="h-px bg-slate-100" />
          </div>

          {/* Image grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {studioPickerLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3,4,5,6].map((i) => (
                  <div key={i} className="aspect-square rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : studioImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-slate-400">
                <Sparkles className="h-10 w-10 mb-3 text-slate-200" />
                <p className="text-sm font-medium text-slate-500">No images here yet</p>
                <p className="text-xs mt-1 text-slate-400">Enhance images in AI Studio to see them here</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {studioImages.map((img) => {
                  const selected = studioSelected.has(img.id);
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(studioSelected);
                        if (next.has(img.id)) next.delete(img.id);
                        else next.add(img.id);
                        setStudioSelected(next);
                      }}
                      className={`relative aspect-square rounded-xl overflow-hidden transition-all duration-150 ${
                        selected
                          ? "ring-2 ring-teal-500 ring-offset-2 scale-[0.97]"
                          : "ring-1 ring-slate-200 hover:ring-teal-300 hover:scale-[0.98]"
                      }`}
                    >
                      <img src={img.imageUrl} alt="" className="h-full w-full object-cover bg-slate-100" />
                      {/* Folder badge */}
                      {img.folder && (
                        <div className="absolute bottom-2 left-2">
                          <span className="text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded backdrop-blur-sm">
                            {img.folder.name}
                          </span>
                        </div>
                      )}
                      {/* Selection overlay */}
                      {selected && (
                        <div className="absolute inset-0 bg-teal-600/15">
                          <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-teal-600 shadow-md flex items-center justify-center">
                            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
            <p className="text-sm text-slate-500">
              {studioSelected.size === 0
                ? "Click any image to select it"
                : `${studioSelected.size} image${studioSelected.size > 1 ? "s" : ""} ready to add`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setStudioPickerOpen(false); setStudioSelected(new Set()); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white px-5"
                disabled={studioSelected.size === 0}
                onClick={addStudioImages}
              >
                Add {studioSelected.size > 0 ? `${studioSelected.size} ` : ""}Image{studioSelected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
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

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => { if (!open && !importing) setImportOpen(false); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-teal-600" />
              Import Products from CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Upload a CSV with your products, plus an optional ZIP of photos named by SKU.
              {" "}
              <a href="/import-guide" target="_blank" rel="noopener" className="text-teal-700 underline font-medium">
                See full instructions →
              </a>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">Step 1 — Products CSV (required)</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />
                    Download template
                  </Button>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportFile(f);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => importFileRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Choose CSV
                  </Button>
                  {importFileName && (
                    <span className="text-xs text-slate-500 truncate max-w-[200px]">{importFileName}</span>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-xs text-slate-500 mb-1 block">
                  Step 2 — Photos ZIP (optional, name files by SKU e.g. SKU-001.jpg)
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={importZipRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportZip(f);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => importZipRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Choose ZIP
                  </Button>
                  {importZipFile ? (
                    <>
                      <span className="text-xs text-slate-600 truncate max-w-[200px]">
                        {importZipFile.name} ({(importZipFile.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                      <button
                        type="button"
                        onClick={() => setImportZipFile(null)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">No ZIP selected</span>
                  )}
                </div>
              </div>
            </div>

            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                {importError}
              </div>
            )}

            {importZipError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
                {importZipError}
              </div>
            )}

            {importRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">
                    Preview — {importRows.length} row{importRows.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-slate-400">Showing first 5</p>
                </div>
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Title</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Price</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Qty</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">SKU</th>
                        <th className="text-left px-3 py-2 font-medium text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 truncate max-w-[200px]">{row.title || <span className="text-red-500">missing</span>}</td>
                          <td className="px-3 py-2">{row.price || <span className="text-red-500">missing</span>}</td>
                          <td className="px-3 py-2">{row.quantity || "0"}</td>
                          <td className="px-3 py-2 text-slate-500">{row.sku || "—"}</td>
                          <td className="px-3 py-2 text-slate-500">{(row.status || "DRAFT").toUpperCase()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
                Cancel
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={runImport}
                disabled={importing || importRows.length === 0}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${importRows.length || ""} product${importRows.length === 1 ? "" : "s"}`
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Detail View */}
      <Dialog open={!!detailProduct} onOpenChange={(open) => { if (!open) setDetailProduct(null); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          {detailProduct && (() => {
            const p = detailProduct;
            const imgs = p.images || [];
            const active = imgs[detailImageIndex] || imgs[0];
            const isAi = Array.isArray(p.tags) && p.tags.includes("ai-enhanced");
            const created = new Date(p.createdAt);
            const updated = new Date(p.updatedAt);
            return (
              <div>
                <DialogHeader className="mb-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-xl flex items-center gap-2">
                        <span className="truncate">{p.title}</span>
                        {isAi && (
                          <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-gradient-to-r from-amber-50 to-fuchsia-50 text-amber-700 border border-amber-200">
                            <Sparkles className="h-2.5 w-2.5" />AI
                          </span>
                        )}
                      </DialogTitle>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge className={statusColors[p.status] || ""}>{p.status}</Badge>
                        {p.marketplaceConnection ? (
                          <Badge variant="outline" className={platformColors[p.marketplaceConnection.platform] || ""}>
                            {p.marketplaceConnection.platform} · {p.marketplaceConnection.storeName}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Manual</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setDetailProduct(null); openEdit(p); }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                    </Button>
                  </div>
                </DialogHeader>

                <div className="grid md:grid-cols-[1fr,1fr] gap-6">
                  {/* Gallery */}
                  <div>
                    <div className="aspect-square rounded-lg bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center">
                      {active ? (
                        <img src={active} alt={p.title} className="w-full h-full object-contain" />
                      ) : (
                        <div className="text-center text-slate-400">
                          <Package className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-sm">No images</p>
                        </div>
                      )}
                    </div>
                    {imgs.length > 1 && (
                      <div className="mt-3 grid grid-cols-6 gap-2">
                        {imgs.map((src, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setDetailImageIndex(i)}
                            className={`aspect-square rounded-md overflow-hidden border transition-all ${i === detailImageIndex ? "border-teal-500 ring-2 ring-teal-200" : "border-slate-200 hover:border-slate-300"}`}
                          >
                            <img src={src} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    {imgs.length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-2 text-center">
                        Image {detailImageIndex + 1} of {imgs.length}
                      </p>
                    )}
                  </div>

                  {/* Info */}
                  <div className="space-y-5">
                    {/* Price */}
                    <div>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Price</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900">{p.price}</span>
                        <span className="text-sm text-slate-500">{p.currency}</span>
                        {p.compareAtPrice && Number(p.compareAtPrice) > 0 && (
                          <span className="text-sm text-slate-400 line-through">{p.compareAtPrice}</span>
                        )}
                      </div>
                    </div>

                    {/* Inventory */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">In stock</p>
                        <p className="text-lg font-semibold text-slate-800">{p.quantity}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">SKU</p>
                        <p className="text-sm font-mono text-slate-700">{p.sku || <span className="text-slate-400">—</span>}</p>
                      </div>
                    </div>

                    {p.description && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{p.description}</p>
                      </div>
                    )}

                    {(p.category || p.productType || p.vendor) && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {p.category && (
                          <div>
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Category</p>
                            <p className="text-slate-700">{p.category}</p>
                          </div>
                        )}
                        {p.productType && (
                          <div>
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</p>
                            <p className="text-slate-700">{p.productType}</p>
                          </div>
                        )}
                        {p.vendor && (
                          <div>
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Vendor</p>
                            <p className="text-slate-700">{p.vendor}</p>
                          </div>
                        )}
                        {p.barcode && (
                          <div>
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Barcode</p>
                            <p className="text-slate-700 font-mono text-xs">{p.barcode}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {(p.weight || p.weightUnit) && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Weight</p>
                        <p className="text-sm text-slate-700">{p.weight} {p.weightUnit}</p>
                      </div>
                    )}

                    {Array.isArray(p.tags) && p.tags.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {p.tags.map((tag, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-teal-50 text-teal-700 border border-teal-200">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-200 text-xs text-slate-500 space-y-0.5">
                      <p>Created {created.toLocaleString()}</p>
                      <p>Last updated {updated.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Bulk Enhance Dialog */}
      <Dialog
        open={bulkEnhanceOpen}
        onOpenChange={(open) => { if (!open && !bulkEnhanceRunning) setBulkEnhanceOpen(false); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Enhance {selectedIds.size} product{selectedIds.size === 1 ? "" : "s"} with AI
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              The first image of each selected product will be enhanced with the chosen background.
              Products without an image are skipped. Results are also saved to your AI Studio library.
            </p>

            <div className="space-y-2">
              <Label>Output</Label>
              <div className="space-y-1.5">
                <label className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
                  bulkEnhanceMode === "prepend" ? "border-teal-400 bg-teal-50/60" : "border-slate-200 hover:bg-slate-50"
                }`}>
                  <input
                    type="radio"
                    name="bulk-enhance-mode"
                    value="prepend"
                    checked={bulkEnhanceMode === "prepend"}
                    onChange={() => setBulkEnhanceMode("prepend")}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">Add enhanced image (keep originals)</p>
                    <p className="text-xs text-slate-500">The new image is added in front; your old images are kept.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
                  bulkEnhanceMode === "overwrite" ? "border-teal-400 bg-teal-50/60" : "border-slate-200 hover:bg-slate-50"
                }`}>
                  <input
                    type="radio"
                    name="bulk-enhance-mode"
                    value="overwrite"
                    checked={bulkEnhanceMode === "overwrite"}
                    onChange={() => setBulkEnhanceMode("overwrite")}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">Overwrite existing images</p>
                    <p className="text-xs text-slate-500">Replaces each product's images with just the enhanced one. Can't be undone.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
                  bulkEnhanceMode === "new" ? "border-teal-400 bg-teal-50/60" : "border-slate-200 hover:bg-slate-50"
                }`}>
                  <input
                    type="radio"
                    name="bulk-enhance-mode"
                    value="new"
                    checked={bulkEnhanceMode === "new"}
                    onChange={() => setBulkEnhanceMode("new")}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">Save as new products (tagged AI)</p>
                    <p className="text-xs text-slate-500">Creates new draft copies marked with an "AI" badge. Originals untouched.</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Background</Label>
              <Select value={bulkEnhanceScene} onValueChange={setBulkEnhanceScene} disabled={!!bulkEnhanceSceneText.trim()}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {backgroundOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="bulk-scene-text" className="text-slate-700">Custom theme <span className="text-slate-400 font-normal">(optional)</span></Label>
                <span className="text-[11px] text-slate-400">{bulkEnhanceSceneText.length}/300</span>
              </div>
              <textarea
                id="bulk-scene-text"
                value={bulkEnhanceSceneText}
                onChange={(e) => setBulkEnhanceSceneText(e.target.value.slice(0, 300))}
                placeholder="e.g. soft pastel pink background with warm morning light"
                rows={2}
                className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 resize-none"
              />
              <p className="text-[11px] text-slate-500">
                {bulkEnhanceSceneText.trim()
                  ? "Using your custom theme — the background preset above is ignored."
                  : "Leave empty to use the background preset above."}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-md text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Credit cost</span>
                <span className="font-medium text-slate-900">
                  {selectedIds.size} credit{selectedIds.size === 1 ? "" : "s"} (1 per product)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Credits available</span>
                <span className={creditClassName + " font-medium"}>
                  {aiCredits ?? "—"}
                </span>
              </div>
              {aiCredits !== null && aiCredits < selectedIds.size && (
                <p className="text-xs text-amber-700 pt-1">
                  Not enough credits for all {selectedIds.size} — the first {aiCredits} will be enhanced, the rest skipped.
                </p>
              )}
            </div>

            {bulkEnhanceProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Processing...</span>
                  <span>{bulkEnhanceProgress.done} / {bulkEnhanceProgress.total}</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: `${Math.min(100, (bulkEnhanceProgress.done / Math.max(1, bulkEnhanceProgress.total)) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setBulkEnhanceOpen(false)}
                disabled={bulkEnhanceRunning}
              >
                Cancel
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 text-white"
                onClick={runBulkEnhance}
                disabled={bulkEnhanceRunning || selectedIds.size === 0 || (aiCredits !== null && aiCredits <= 0)}
              >
                {bulkEnhanceRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enhancing...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Enhance {selectedIds.size}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Enhance Product Dialog */}
      <Dialog
        open={!!enhanceProduct}
        onOpenChange={(open) => {
          if (!open && !enhanceProductRunning) setEnhanceProduct(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Enhance with AI
            </DialogTitle>
          </DialogHeader>
          {enhanceProduct && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {enhanceProduct.images?.[0] && (
                  <img
                    src={enhanceProduct.images[0]}
                    alt={enhanceProduct.title}
                    className="h-16 w-16 rounded-md object-cover border border-slate-200"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{enhanceProduct.title}</p>
                  <p className="text-xs text-slate-500">
                    Uses the first image. 1 credit per enhancement.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Background</Label>
                <Select value={enhanceProductScene} onValueChange={setEnhanceProductScene} disabled={!!enhanceProductSceneText.trim()}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {backgroundOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="single-scene-text" className="text-slate-700">Custom theme <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <span className="text-[11px] text-slate-400">{enhanceProductSceneText.length}/300</span>
                </div>
                <textarea
                  id="single-scene-text"
                  value={enhanceProductSceneText}
                  onChange={(e) => setEnhanceProductSceneText(e.target.value.slice(0, 300))}
                  placeholder="e.g. marble countertop with warm morning sunlight"
                  rows={2}
                  className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 resize-none"
                />
                <p className="text-[11px] text-slate-500">
                  {enhanceProductSceneText.trim()
                    ? "Using your custom theme — the background preset above is ignored."
                    : "Leave empty to use the background preset above."}
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-md text-xs text-slate-600">
                <span>AI Credits</span>
                <span className={creditClassName + " font-medium"}>
                  {aiCredits ?? "—"} available
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEnhanceProduct(null)}
                  disabled={enhanceProductRunning}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={runEnhanceProduct}
                  disabled={enhanceProductRunning || (aiCredits !== null && aiCredits <= 0)}
                >
                  {enhanceProductRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enhancing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Enhance
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}