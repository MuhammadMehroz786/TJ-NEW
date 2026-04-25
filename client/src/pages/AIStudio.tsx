import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Download, FolderPlus, ImagePlus, Loader2, Package, Pencil, Plus, Search, Sparkles, Trash2, X, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import api from "@/lib/api";
import { useTranslation } from "react-i18next";
import { startEnhanceJob, startRefineJob, startPackJob, subscribeToResults } from "@/lib/aiStudioJobs";
import { AiStudioJobsPill } from "@/components/AiStudioJobsPill";

interface AiStudioImage {
  id: string;
  imageUrl: string;
  background: string;
  createdAt: string;
  folder?: { id: string; name: string } | null;
}

interface AiStudioFolder {
  id: string;
  name: string;
  _count?: { images: number };
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

export function AIStudio() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [images, setImages] = useState<AiStudioImage[]>([]);
  const [folders, setFolders] = useState<AiStudioFolder[]>([]);
  const [aiCredits, setAiCredits] = useState<number | null>(null);
  const [weeklyCredits, setWeeklyCredits] = useState<number | null>(null);
  const [purchasedCredits, setPurchasedCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [background, setBackground] = useState("studio");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [search, setSearch] = useState("");
  const [previewImage, setPreviewImage] = useState<AiStudioImage | null>(null);
  const [newlyEnhanced, setNewlyEnhanced] = useState<AiStudioImage | null>(null);
  const [savingEnhanceFolder, setSavingEnhanceFolder] = useState("none");
  const [packPreset, setPackPreset] = useState<"starter" | "full" | "catalog" | "lifestyle">("starter");
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refineHistory, setRefineHistory] = useState<AiStudioImage[]>([]);
  const [undoing, setUndoing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Gallery multi-select (different from `selectedImages` above, which
  // stages freshly-uploaded images for enhancement). These are ids of
  // existing gallery rows that the merchant ticked for a bulk action.
  const [selectedGalleryIds, setSelectedGalleryIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkEnhanceOpen, setBulkEnhanceOpen] = useState(false);
  const [bulkEnhanceScene, setBulkEnhanceScene] = useState("studio");
  const [bulkEnhanceSceneText, setBulkEnhanceSceneText] = useState("");
  const [bulkEnhanceRunning, setBulkEnhanceRunning] = useState(false);
  const [bulkRelabelOpen, setBulkRelabelOpen] = useState(false);
  const [bulkRelabelValue, setBulkRelabelValue] = useState("");
  const [bulkAddProductOpen, setBulkAddProductOpen] = useState(false);
  const [bulkProductQuery, setBulkProductQuery] = useState("");
  const [bulkProductResults, setBulkProductResults] = useState<Array<{ id: string; title: string; images?: string[] }>>([]);
  const [bulkProductLoading, setBulkProductLoading] = useState(false);
  const [bulkActionRunning, setBulkActionRunning] = useState(false);

  const fetchFolders = useCallback(() => {
    api.get("/ai-studio/folders").then((res) => setFolders(res.data || [])).catch(() => toast.error("Failed to load folders"));
  }, []);

  const fetchImages = useCallback(() => {
    setLoading(true);
    api
      .get("/ai-studio/images", { params: { page: 1, pageSize: 200 } })
      .then((res) => setImages(res.data.data || []))
      .catch(() => toast.error("Failed to load AI Studio images"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFolders();
    fetchImages();
    api.get("/credits/balance")
      .then((res) => {
        setAiCredits(res.data.totalCredits);
        setWeeklyCredits(res.data.weeklyCredits);
        setPurchasedCredits(res.data.purchasedCredits);
      })
      .catch(() => {});
  }, [fetchFolders, fetchImages]);

  // Listen for background enhance/refine/pack results → update gallery + credits
  useEffect(() => {
    return subscribeToResults((r) => {
      if (r.type === "error") {
        toast.error(r.error);
        return;
      }

      if (r.type === "pack") {
        // Prepend all successful pack shots at once, de-duped
        const newIds = new Set(r.results.map((img) => img.id));
        setImages((prev) => [...r.results, ...prev.filter((img) => !newIds.has(img.id))]);
        if (typeof r.remainingCredits === "number") setAiCredits(r.remainingCredits);
        if (typeof r.weeklyCredits === "number") setWeeklyCredits(r.weeklyCredits);
        if (typeof r.purchasedCredits === "number") setPurchasedCredits(r.purchasedCredits);
        fetchFolders();

        if (r.scenesGenerated > 0 && r.failures.length === 0) {
          toast.success(`Pack ready — ${r.scenesGenerated} shots generated`);
        } else if (r.scenesGenerated > 0 && r.failures.length > 0) {
          toast.info(`Pack partially done — ${r.scenesGenerated}/${r.scenesRequested} shots. ${r.failures.length} failed.`);
        } else {
          toast.error(`Pack failed — ${r.failures[0]?.error || "no shots generated"}`);
        }
        return;
      }

      const refined = r.result;
      setImages((prev) => [refined, ...prev.filter((img) => img.id !== refined.id)]);
      if (typeof r.remainingCredits === "number") setAiCredits(r.remainingCredits);
      if (typeof r.weeklyCredits === "number") setWeeklyCredits(r.weeklyCredits);
      if (typeof r.purchasedCredits === "number") setPurchasedCredits(r.purchasedCredits);
      fetchFolders();

      if (r.job.type === "refine" && r.refineSourceImageId) {
        setPreviewImage((current) => {
          if (!current) return current;
          if (current.id === r.refineSourceImageId) {
            setRefineHistory((hist) => [...hist, current]);
            return refined;
          }
          return current;
        });
        toast.success("Refinement ready");
      } else {
        toast.success(r.job.type === "enhance" ? "Enhancement ready" : "Done");
      }
    });
  }, [fetchFolders]);

  const handleFileSelect = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (fileArray.length === 0) {
      toast.error("Please select image files");
      return;
    }
    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setSelectedImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) handleFileSelect(e.dataTransfer.files);
  };

  const handleEnhance = () => {
    if (selectedImages.length === 0) return toast.error("Please upload image(s) first");
    const images = selectedImages;
    const folderId = selectedFolderId === "all" ? null : selectedFolderId;
    const count = images.length;

    for (let i = 0; i < images.length; i++) {
      startEnhanceJob({
        image: images[i],
        background,
        folderId,
        label: count > 1 ? `Enhancing ${i + 1} of ${count}` : "Enhancing image",
      });
    }
    setSelectedImages([]);
    toast.info(count === 1 ? "Enhancement started — you can keep working" : `Enhancing ${count} images in the background`);
  };

  const handleGeneratePack = () => {
    if (selectedImages.length === 0) return toast.error("Please upload an image first");
    if (selectedImages.length > 1) {
      toast.info("Pack mode uses only the first uploaded image — generating a pack from it.");
    }
    const image = selectedImages[0];
    const folderId = selectedFolderId === "all" ? null : selectedFolderId;
    const labels: Record<string, string> = {
      starter: "Starter pack (3 shots)",
      full: "Full merchant pack (5 shots)",
      catalog: "Catalog pack (3 shots)",
      lifestyle: "Lifestyle pack (3 shots)",
    };
    startPackJob({
      image,
      preset: packPreset,
      folderId,
      label: labels[packPreset] || "Generating pack",
    });
    setSelectedImages([]);
    toast.info(`${labels[packPreset]} started — you can keep working.`);
  };

  const handleRefine = (instruction: string) => {
    if (!previewImage) return;
    const trimmed = instruction.trim();
    if (trimmed.length < 3) return toast.error("Describe the refinement in at least 3 characters");
    startRefineJob({
      imageId: previewImage.id,
      instruction: trimmed,
      label: "Refining image",
    });
    setRefineInstruction("");
    toast.info("Refining in the background — you can close this dialog");
  };

  const handleUndoRefine = async () => {
    if (!previewImage || refineHistory.length === 0) return;
    const prevImage = refineHistory[refineHistory.length - 1];
    const currentRefined = previewImage;
    setUndoing(true);
    try {
      await api.delete(`/ai-studio/images/${currentRefined.id}`);
      setImages((prev) => prev.filter((img) => img.id !== currentRefined.id));
      setPreviewImage(prevImage);
      setRefineHistory((prev) => prev.slice(0, -1));
      toast.success("Refinement undone");
    } catch {
      toast.error("Failed to undo refinement");
    } finally {
      setUndoing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this image? This can't be undone.")) return;
    try {
      await api.delete(`/ai-studio/images/${id}`);
      setImages((prev) => prev.filter((img) => img.id !== id));
      fetchFolders();
      toast.success("Image deleted");
    } catch {
      toast.error("Failed to delete image");
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return toast.error("Please enter a folder name");
    try {
      const res = await api.post("/ai-studio/folders", { name });
      setFolders((prev) => [res.data, ...prev]);
      setNewFolderName("");
      toast.success("Folder created");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to create folder");
    }
  };

  const handleRenameFolder = async () => {
    if (!renameFolderId) return;
    const name = renameFolderName.trim();
    if (!name) return toast.error("Folder name is required");
    try {
      const res = await api.patch(`/ai-studio/folders/${renameFolderId}`, { name });
      setFolders((prev) => prev.map((f) => (f.id === renameFolderId ? res.data : f)));
      setImages((prev) => prev.map((img) => (img.folder?.id === renameFolderId ? { ...img, folder: { id: renameFolderId, name: res.data.name } } : img)));
      setRenameFolderId(null);
      setRenameFolderName("");
      toast.success("Folder renamed");
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to rename folder");
    }
  };

  const handleDeleteFolder = async (id: string) => {
    const f = folders.find((x) => x.id === id);
    if (!window.confirm(`Delete folder${f ? ` "${f.name}"` : ""}? Images inside will be unfiled, not deleted.`)) return;
    try {
      await api.delete(`/ai-studio/folders/${id}`);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setImages((prev) => prev.map((img) => (img.folder?.id === id ? { ...img, folder: null } : img)));
      if (selectedFolderId === id) setSelectedFolderId("all");
      toast.success("Folder deleted");
    } catch {
      toast.error("Failed to delete folder");
    }
  };

  const handleMoveImageToFolder = async (imageId: string, folderId: string | null) => {
    try {
      const res = await api.patch(`/ai-studio/images/${imageId}/folder`, { folderId });
      setImages((prev) => prev.map((img) => (img.id === imageId ? res.data : img)));
      fetchFolders();
      const folderName = folderId ? folders.find((f) => f.id === folderId)?.name : null;
      toast.success(folderName ? `Moved to "${folderName}"` : "Removed from folder");
    } catch {
      toast.error("Failed to move image");
    }
  };

  // ── Gallery multi-select handlers ────────────────────────────────────────
  const toggleSelected = (id: string) => {
    setSelectedGalleryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedGalleryIds(new Set());

  const runBulkMove = async (targetFolderId: string | null) => {
    const ids = Array.from(selectedGalleryIds);
    if (ids.length === 0) return;
    setBulkActionRunning(true);
    try {
      await api.patch("/ai-studio/images/bulk", { ids, action: "move", folderId: targetFolderId });
      const folderName = targetFolderId ? folders.find((f) => f.id === targetFolderId)?.name : null;
      toast.success(folderName ? `Moved ${ids.length} to "${folderName}"` : `Unfiled ${ids.length} image(s)`);
      setBulkMoveOpen(false);
      clearSelection();
      fetchImages();
      fetchFolders();
    } catch {
      toast.error("Bulk move failed");
    } finally {
      setBulkActionRunning(false);
    }
  };

  const runBulkDelete = async () => {
    const ids = Array.from(selectedGalleryIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} image${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setBulkActionRunning(true);
    try {
      const res = await api.patch("/ai-studio/images/bulk", { ids, action: "delete" });
      toast.success(`Deleted ${res.data.deleted ?? ids.length} image(s)`);
      clearSelection();
      fetchImages();
      fetchFolders();
    } catch {
      toast.error("Bulk delete failed");
    } finally {
      setBulkActionRunning(false);
    }
  };

  const runBulkRelabel = async () => {
    const ids = Array.from(selectedGalleryIds);
    const background = bulkRelabelValue.trim();
    if (ids.length === 0 || !background) return;
    setBulkActionRunning(true);
    try {
      await api.patch("/ai-studio/images/bulk", { ids, action: "relabel", background });
      toast.success(`Relabelled ${ids.length} image(s)`);
      setBulkRelabelOpen(false);
      setBulkRelabelValue("");
      clearSelection();
      fetchImages();
    } catch {
      toast.error("Relabel failed");
    } finally {
      setBulkActionRunning(false);
    }
  };

  const runBulkDownload = async () => {
    const ids = Array.from(selectedGalleryIds);
    if (ids.length === 0) return;
    setBulkActionRunning(true);
    const toastId = toast.loading(`Preparing ZIP with ${ids.length} image(s)...`);
    try {
      // responseType: 'blob' so axios doesn't try to parse the bytes as JSON
      const res = await api.post("/ai-studio/images/download-zip", { ids }, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tijarflow-ai-studio-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss(toastId);
      toast.success(`Downloaded ${ids.length} image(s)`);
    } catch {
      toast.dismiss(toastId);
      toast.error("ZIP download failed");
    } finally {
      setBulkActionRunning(false);
    }
  };

  const runBulkEnhance = async () => {
    const ids = Array.from(selectedGalleryIds);
    if (ids.length === 0) return;
    setBulkEnhanceRunning(true);
    const toastId = toast.loading(`Enhancing ${ids.length} image(s)... this may take a few minutes`);
    try {
      const res = await api.post("/ai-studio/images/bulk-enhance", {
        ids,
        scene: bulkEnhanceScene,
        sceneText: bulkEnhanceSceneText.trim() || undefined,
        folderId: selectedFolderId === "all" ? null : selectedFolderId,
      });
      const { succeeded, failed, remainingCredits } = res.data as {
        succeeded: { sourceId: string; newId: string }[];
        failed: { sourceId: string; error: string }[];
        remainingCredits: number;
      };
      toast.dismiss(toastId);
      if (typeof remainingCredits === "number") setAiCredits(remainingCredits);
      if (failed.length === 0) toast.success(`Enhanced ${succeeded.length} new image(s)`);
      else if (succeeded.length === 0) { toast.error(`All ${failed.length} failed`); console.error(failed); }
      else { toast.warning(`Enhanced ${succeeded.length} · ${failed.length} failed`); console.warn(failed); }
      setBulkEnhanceOpen(false);
      setBulkEnhanceSceneText("");
      clearSelection();
      fetchImages();
    } catch (err: unknown) {
      toast.dismiss(toastId);
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Bulk enhancement failed",
      );
    } finally {
      setBulkEnhanceRunning(false);
    }
  };

  const searchProductsForBulkAdd = useCallback(async (q: string) => {
    setBulkProductLoading(true);
    try {
      const res = await api.get("/products", { params: { page: 1, pageSize: 30, search: q } });
      setBulkProductResults(res.data?.data || []);
    } catch {
      setBulkProductResults([]);
    } finally {
      setBulkProductLoading(false);
    }
  }, []);

  const runBulkAddToProduct = async (productId: string) => {
    const ids = Array.from(selectedGalleryIds);
    if (ids.length === 0 || !productId) return;
    setBulkActionRunning(true);
    try {
      const product = bulkProductResults.find((p) => p.id === productId);
      const existing = Array.isArray(product?.images) ? product!.images! : [];
      const urlsToAdd = images
        .filter((img) => selectedGalleryIds.has(img.id))
        .map((img) => img.imageUrl);
      await api.put(`/products/${productId}`, {
        images: [...urlsToAdd, ...existing],
      });
      toast.success(`Added ${ids.length} image(s) to "${product?.title ?? "product"}"`);
      setBulkAddProductOpen(false);
      clearSelection();
    } catch {
      toast.error("Couldn't add to product");
    } finally {
      setBulkActionRunning(false);
    }
  };

  const runBulkCreateProduct = () => {
    const ids = Array.from(selectedGalleryIds);
    if (ids.length === 0) return;
    // Park the selected imageUrls in sessionStorage and hop to Products page,
    // which reads them and opens the Add Product dialog pre-populated.
    const urls = images.filter((img) => selectedGalleryIds.has(img.id)).map((img) => img.imageUrl);
    try {
      sessionStorage.setItem("tijarflow_prefill_product_images", JSON.stringify(urls));
      navigate("/products?new=1");
    } catch {
      toast.error("Couldn't hand off to Products page");
    }
  };

  const filteredImages = useMemo(() => {
    const byFolder = selectedFolderId === "all" ? images : images.filter((img) => img.folder?.id === selectedFolderId);
    const query = search.trim().toLowerCase();
    if (!query) return byFolder;
    return byFolder.filter((img) => (img.folder?.name || "").toLowerCase().includes(query) || img.background.toLowerCase().includes(query));
  }, [images, selectedFolderId, search]);

  return (
    <div>
      <AiStudioJobsPill />
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("aiStudio.title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("aiStudio.itemsCount", { count: images.length })}</p>
        </div>
        {/* Credits pill */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${
            aiCredits === null ? "border-slate-200 bg-slate-50 text-slate-500"
            : aiCredits <= 0 ? "border-red-200 bg-red-50 text-red-700"
            : aiCredits <= 5 ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-teal-200 bg-teal-50 text-teal-700"
          }`}>
            <Sparkles className="h-3.5 w-3.5" />
            <span>{aiCredits ?? "—"} credits</span>
            {weeklyCredits !== null && purchasedCredits !== null && (
              <span className="text-xs opacity-70">
                ({weeklyCredits} monthly + {purchasedCredits} purchased)
              </span>
            )}
          </div>
          <button
            onClick={() => navigate("/billing")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-300 bg-white text-teal-700 text-sm font-medium hover:bg-teal-50 transition-colors"
          >
            <Wallet className="h-3.5 w-3.5" />
            {t("aiStudio.buyCredits")}
          </button>
        </div>
      </div>
      {aiCredits !== null && aiCredits <= 0 && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <span className="font-medium">Credits exhausted.</span>
          <span>Your monthly credits reset on the 1st, or </span>
          <button onClick={() => navigate("/billing")} className="underline font-medium">buy more now</button>.
        </div>
      )}

      <Card className="border-slate-200/60">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">{t("aiStudio.folders")}</h2>
              <div className="flex gap-2">
                <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder={t("aiStudio.newFolder")} />
                <Button onClick={handleCreateFolder} variant="outline" size="icon"><FolderPlus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
                <button className={`w-full text-left px-2.5 py-2 rounded-md border text-sm ${selectedFolderId === "all" ? "border-teal-300 bg-teal-50 text-teal-700" : "border-slate-200 hover:bg-slate-50"}`} onClick={() => setSelectedFolderId("all")}>{t("aiStudio.allImages")} ({images.length})</button>
                {folders.map((folder) => (
                  <div key={folder.id} className="flex items-center gap-1">
                    <button className={`flex-1 text-left px-2.5 py-2 rounded-md border text-sm ${selectedFolderId === folder.id ? "border-teal-300 bg-teal-50 text-teal-700" : "border-slate-200 hover:bg-slate-50"}`} onClick={() => setSelectedFolderId(folder.id)}>{folder.name} ({folder._count?.images || 0})</button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setRenameFolderId(folder.id); setRenameFolderName(folder.name); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" onClick={() => handleDeleteFolder(folder.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${dragging ? "border-teal-400 bg-teal-50/60" : "border-slate-200 bg-slate-50/50 hover:border-slate-300"}`}>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileSelect(e.target.files)} />
                <div className="flex flex-col items-center gap-2">
                  <ImagePlus className="h-8 w-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">{t("aiStudio.uploadHint")}</p>
                  <p className="text-xs text-slate-400">{t("aiStudio.uploadDragHint")}</p>
                </div>
              </div>

              {selectedImages.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500">{selectedImages.length} selected</p>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedImages([])}>Clear all</Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedImages.map((src, idx) => (
                      <div key={`${src.slice(0, 20)}-${idx}`} className="relative">
                        <img src={src} alt="Preview" className="h-20 w-full rounded-md border border-slate-200 object-cover" />
                        <button
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                          onClick={() => setSelectedImages((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex gap-2 flex-wrap">
                <Select value={background} onValueChange={setBackground}>
                  <SelectTrigger className="w-[170px] border-teal-200 text-teal-700"><SelectValue placeholder="Background" /></SelectTrigger>
                  <SelectContent>{backgroundOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder={t("aiStudio.saveInFolder")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("aiStudio.unfiled")}</SelectItem>
                    {folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={handleEnhance} disabled={selectedImages.length === 0} className="bg-teal-600 hover:bg-teal-700 text-white">
                  <Sparkles className="h-4 w-4 mr-2" />{t("aiStudio.enhance")}
                </Button>
                <div className="flex items-center gap-1 ps-2 border-s border-slate-200">
                  <Select value={packPreset} onValueChange={(v) => setPackPreset(v as typeof packPreset)}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder={t("aiStudio.packPreset")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter (3 shots)</SelectItem>
                      <SelectItem value="full">Full merchant pack (5)</SelectItem>
                      <SelectItem value="catalog">Catalog (3 shots)</SelectItem>
                      <SelectItem value="lifestyle">Lifestyle (3 shots)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={handleGeneratePack}
                    disabled={selectedImages.length === 0}
                    className="border-purple-200 text-purple-700 hover:bg-purple-50"
                    title="Generate a full gallery of shots from one product image"
                  >
                    <Package className="h-4 w-4 mr-2" />{t("aiStudio.generatePack")}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-5 mb-3">
                <h2 className="text-base font-semibold text-slate-900">{selectedFolderId === "all" ? t("aiStudio.allImages") : folders.find((f) => f.id === selectedFolderId)?.name || "Folder"}</h2>
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder={t("aiStudio.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" />
                </div>
              </div>

              {loading ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              ) : filteredImages.length === 0 ? (
                <div className="text-center py-12 border rounded-lg">
                  <Sparkles className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-slate-700">{t("aiStudio.empty")}</h3>
                  <p className="text-slate-400 text-sm mt-1">{t("aiStudio.emptyHint")}</p>
                </div>
              ) : (
                <>
                  {/* Bulk action bar — appears when any gallery items are selected */}
                  {selectedGalleryIds.size > 0 && (
                    <div className="mb-3 p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center flex-wrap gap-2">
                      <span className="text-sm font-medium text-teal-800">
                        {selectedGalleryIds.size} selected
                      </span>
                      <div className="h-5 w-px bg-teal-200 mx-1" />
                      <Button size="sm" variant="outline" onClick={() => setBulkMoveOpen(true)} disabled={bulkActionRunning}>
                        <FolderPlus className="h-3.5 w-3.5 mr-1.5" />Move
                      </Button>
                      <Button size="sm" variant="outline" onClick={runBulkDownload} disabled={bulkActionRunning}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />Download ZIP
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setBulkEnhanceOpen(true)} disabled={bulkActionRunning} className="text-amber-700 border-amber-200 hover:bg-amber-50">
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />Enhance again
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setBulkRelabelValue(""); setBulkRelabelOpen(true); }} disabled={bulkActionRunning}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />Relabel
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setBulkProductQuery(""); setBulkProductResults([]); setBulkAddProductOpen(true); searchProductsForBulkAdd(""); }} disabled={bulkActionRunning}>
                        <Package className="h-3.5 w-3.5 mr-1.5" />Add to product
                      </Button>
                      <Button size="sm" variant="outline" onClick={runBulkCreateProduct} disabled={bulkActionRunning}>
                        <ImagePlus className="h-3.5 w-3.5 mr-1.5" />Create product
                      </Button>
                      <Button size="sm" variant="outline" onClick={runBulkDelete} disabled={bulkActionRunning} className="text-red-600 border-red-200 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete
                      </Button>
                      <div className="ml-auto">
                        <button onClick={clearSelection} className="text-xs text-slate-500 hover:text-slate-700 underline">Clear</button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredImages.map((item) => {
                    const isSelected = selectedGalleryIds.has(item.id);
                    return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/ai-studio-image-id", item.id)}
                      className={`border rounded-lg overflow-hidden bg-white transition-shadow ${isSelected ? "border-teal-500 ring-2 ring-teal-200" : "border-slate-200"}`}
                    >
                      <div className="relative group">
                        {/* Selection checkbox — top-left overlay, always visible once anything is selected, otherwise shows on hover */}
                        <label
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute top-2 left-2 z-10 h-6 w-6 rounded bg-white/90 border border-slate-300 flex items-center justify-center cursor-pointer transition-opacity ${selectedGalleryIds.size > 0 || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(item.id)}
                            className="h-3.5 w-3.5 accent-teal-600"
                          />
                        </label>
                        <button onClick={() => setPreviewImage(item)} className="w-full"><img src={item.imageUrl} alt="Enhanced product" className="w-full h-44 object-cover bg-slate-50" /></button>
                        <button onClick={() => handleDelete(item.id)} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/70 text-white flex items-center justify-center"><X className="h-4 w-4" /></button>
                      </div>
                      <div className="p-2.5 flex items-center justify-between">
                        <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</p>
                        <div className="flex items-center gap-1">
                          <a href={item.imageUrl} download className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50"><Download className="h-4 w-4 text-slate-600" /></a>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50"><Plus className="h-4 w-4 text-slate-600" /></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => handleMoveImageToFolder(item.id, null)}><Check className="mr-2 h-4 w-4" />Remove from folder</DropdownMenuItem>
                              {folders.map((folder) => <DropdownMenuItem key={folder.id} onClick={() => handleMoveImageToFolder(item.id, folder.id)}><FolderPlus className="mr-2 h-4 w-4" />{folder.name}</DropdownMenuItem>)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!previewImage}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewImage(null);
            setRefineInstruction("");
            setRefineHistory([]);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("aiStudio.preview")}</DialogTitle></DialogHeader>
          {previewImage && (
            <div className="space-y-4">
              <img src={previewImage.imageUrl} alt="Preview" className="w-full max-h-[55vh] object-contain rounded-lg bg-slate-50" />

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{t("aiStudio.refineTitle")}</p>
                  <div className="flex items-center gap-2">
                    {refineHistory.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUndoRefine}
                        disabled={undoing}
                        className="h-7 px-2.5 text-xs"
                      >
                        {undoing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                        {undoing ? t("aiStudio.undoing") : t("aiStudio.undo")}
                      </Button>
                    )}
                    <span className="text-xs text-slate-500">{t("aiStudio.refineCost")}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Change background", value: "Replace ONLY the background with a different professional e-commerce scene. Keep the product, its lighting, and the existing exposure level exactly the same." },
                    { label: "Softer lighting",   value: "Make the lighting softer and more diffused — add a gentle key light with feathered edges and cleaner soft shadows beneath the product. Do NOT increase overall brightness, do NOT wash out the image, and do NOT reduce contrast. Preserve the existing exposure and color saturation." },
                    { label: "Warmer tones",      value: "Apply a subtle warm color grade (lift shadows slightly toward amber, add a touch of warmth to highlights). Keep the product's true colors accurate. Do NOT change exposure or saturation." },
                    { label: "Deeper shadows",    value: "Deepen the contact shadows beneath the product for more grounded realism. Keep everything else — product, background, overall exposure — identical." },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => handleRefine(chip.value)}
                      className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("aiStudio.refinePlaceholder")}
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRefine(refineInstruction);
                    }}
                  />
                  <Button
                    onClick={() => handleRefine(refineInstruction)}
                    disabled={refineInstruction.trim().length < 3}
                    className="bg-teal-600 hover:bg-teal-700 text-white whitespace-nowrap"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />{t("aiStudio.refine")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameFolderId} onOpenChange={() => setRenameFolderId(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("aiStudio.renameFolder")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameFolderId(null)}>Cancel</Button>
              <Button onClick={handleRenameFolder} className="bg-teal-600 hover:bg-teal-700 text-white">Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!newlyEnhanced} onOpenChange={() => setNewlyEnhanced(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Image Enhanced</DialogTitle></DialogHeader>
          {newlyEnhanced && (
            <div className="space-y-3">
              <img src={newlyEnhanced.imageUrl} alt="Enhanced" className="w-full max-h-[50vh] object-contain rounded-lg bg-slate-50" />
              <div className="flex items-center gap-2">
                <Select value={savingEnhanceFolder} onValueChange={setSavingEnhanceFolder}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Choose folder" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unfiled</SelectItem>
                    {folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => handleMoveImageToFolder(newlyEnhanced.id, savingEnhanceFolder === "none" ? null : savingEnhanceFolder)}>
                  Save Location
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Move Dialog */}
      <Dialog open={bulkMoveOpen} onOpenChange={(open) => { if (!open && !bulkActionRunning) setBulkMoveOpen(false); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Move {selectedGalleryIds.size} image{selectedGalleryIds.size === 1 ? "" : "s"} to…</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => runBulkMove(null)} disabled={bulkActionRunning}>
              <X className="mr-2 h-4 w-4" />Unfiled (remove from current folder)
            </Button>
            <div className="border-t pt-2 max-h-80 overflow-y-auto space-y-1">
              {folders.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No folders yet — create one from the sidebar.</p>}
              {folders.map((folder) => (
                <Button key={folder.id} variant="outline" className="w-full justify-start" onClick={() => runBulkMove(folder.id)} disabled={bulkActionRunning}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  {folder.name}
                  <span className="ml-auto text-xs text-slate-400">{folder._count?.images ?? 0}</span>
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Enhance Dialog */}
      <Dialog open={bulkEnhanceOpen} onOpenChange={(open) => { if (!open && !bulkEnhanceRunning) setBulkEnhanceOpen(false); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" />Enhance {selectedGalleryIds.size} image{selectedGalleryIds.size === 1 ? "" : "s"} again</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Each selected image becomes the input for a fresh enhancement. Originals are kept; new results land in the current folder.</p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Background</label>
              <Select value={bulkEnhanceScene} onValueChange={setBulkEnhanceScene} disabled={!!bulkEnhanceSceneText.trim()}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {backgroundOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Custom theme <span className="text-slate-400 font-normal">(optional)</span></label>
                <span className="text-[11px] text-slate-400">{bulkEnhanceSceneText.length}/300</span>
              </div>
              <textarea
                value={bulkEnhanceSceneText}
                onChange={(e) => setBulkEnhanceSceneText(e.target.value.slice(0, 300))}
                placeholder="e.g. soft pastel background with warm morning light"
                rows={2}
                className="flex w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 resize-none"
              />
            </div>
            <div className="p-3 bg-slate-50 rounded-md text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-600">Credit cost</span><span className="font-medium">{selectedGalleryIds.size} credit{selectedGalleryIds.size === 1 ? "" : "s"}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-600">Credits available</span><span className="font-medium">{aiCredits ?? "—"}</span></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkEnhanceOpen(false)} disabled={bulkEnhanceRunning}>Cancel</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={runBulkEnhance} disabled={bulkEnhanceRunning || (aiCredits !== null && aiCredits <= 0)}>
                {bulkEnhanceRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enhancing...</> : <><Sparkles className="mr-2 h-4 w-4" />Enhance {selectedGalleryIds.size}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Relabel Dialog */}
      <Dialog open={bulkRelabelOpen} onOpenChange={(open) => { if (!open && !bulkActionRunning) setBulkRelabelOpen(false); }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Relabel {selectedGalleryIds.size} image{selectedGalleryIds.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Overwrites the scene/background label shown under each image (e.g. "Kitchen", "Summer 2026", "Hero shot").</p>
            <Input
              value={bulkRelabelValue}
              onChange={(e) => setBulkRelabelValue(e.target.value.slice(0, 80))}
              placeholder="New label"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkRelabelOpen(false)} disabled={bulkActionRunning}>Cancel</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={runBulkRelabel} disabled={bulkActionRunning || !bulkRelabelValue.trim()}>Relabel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Add to Product Dialog */}
      <Dialog open={bulkAddProductOpen} onOpenChange={(open) => { if (!open && !bulkActionRunning) setBulkAddProductOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add {selectedGalleryIds.size} image{selectedGalleryIds.size === 1 ? "" : "s"} to a product</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={bulkProductQuery}
                onChange={(e) => { setBulkProductQuery(e.target.value); searchProductsForBulkAdd(e.target.value); }}
                placeholder="Search your products by title..."
                className="ps-10"
              />
            </div>
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-md divide-y">
              {bulkProductLoading ? (
                <div className="p-4 text-center text-sm text-slate-500">Loading...</div>
              ) : bulkProductResults.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">No products found</div>
              ) : (
                bulkProductResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => runBulkAddToProduct(p.id)}
                    disabled={bulkActionRunning}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left disabled:opacity-60"
                  >
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt="" className="h-10 w-10 rounded object-cover bg-slate-100" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-slate-100 flex items-center justify-center"><Package className="h-4 w-4 text-slate-300" /></div>
                    )}
                    <span className="text-sm font-medium text-slate-800 truncate flex-1">{p.title}</span>
                    <Plus className="h-4 w-4 text-slate-400" />
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
