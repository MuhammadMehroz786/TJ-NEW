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
    try {
      await api.delete(`/ai-studio/images/${id}`);
      setImages((prev) => prev.filter((img) => img.id !== id));
      fetchFolders();
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
          <h1 className="text-2xl font-semibold text-slate-900">AI Studio</h1>
          <p className="text-slate-500 text-sm mt-1">{images.length} items in All Images</p>
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
                ({weeklyCredits} weekly + {purchasedCredits} purchased)
              </span>
            )}
          </div>
          <button
            onClick={() => navigate("/billing")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-teal-300 bg-white text-teal-700 text-sm font-medium hover:bg-teal-50 transition-colors"
          >
            <Wallet className="h-3.5 w-3.5" />
            Buy Credits
          </button>
        </div>
      </div>
      {aiCredits !== null && aiCredits <= 0 && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <span className="font-medium">Credits exhausted.</span>
          <span>Your weekly credits reset Monday, or </span>
          <button onClick={() => navigate("/billing")} className="underline font-medium">buy more now</button>.
        </div>
      )}

      <Card className="border-slate-200/60">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-900">Folders</h2>
              <div className="flex gap-2">
                <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="New folder" />
                <Button onClick={handleCreateFolder} variant="outline" size="icon"><FolderPlus className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
                <button className={`w-full text-left px-2.5 py-2 rounded-md border text-sm ${selectedFolderId === "all" ? "border-teal-300 bg-teal-50 text-teal-700" : "border-slate-200 hover:bg-slate-50"}`} onClick={() => setSelectedFolderId("all")}>All Images ({images.length})</button>
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
                  <p className="text-sm font-medium text-slate-700">Upload product image(s)</p>
                  <p className="text-xs text-slate-400">Drag & drop multiple images or click to browse</p>
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
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Save in folder" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Unfiled</SelectItem>
                    {folders.map((folder) => <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={handleEnhance} disabled={selectedImages.length === 0} className="bg-teal-600 hover:bg-teal-700 text-white">
                  <Sparkles className="h-4 w-4 mr-2" />Enhance All & Save
                </Button>
                <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                  <Select value={packPreset} onValueChange={(v) => setPackPreset(v as typeof packPreset)}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Pack preset" /></SelectTrigger>
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
                    <Package className="h-4 w-4 mr-2" />Generate Pack
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-5 mb-3">
                <h2 className="text-base font-semibold text-slate-900">{selectedFolderId === "all" ? "All Images" : folders.find((f) => f.id === selectedFolderId)?.name || "Folder"}</h2>
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Search background or folder..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
              </div>

              {loading ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
              ) : filteredImages.length === 0 ? (
                <div className="text-center py-12 border rounded-lg">
                  <Sparkles className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-slate-700">No images found</h3>
                  <p className="text-slate-400 text-sm mt-1">Enhance an image or change folder filter</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredImages.map((item) => (
                    <div key={item.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/ai-studio-image-id", item.id)} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <div className="relative">
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
                  ))}
                </div>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Image Preview</DialogTitle></DialogHeader>
          {previewImage && (
            <div className="space-y-4">
              <img src={previewImage.imageUrl} alt="Preview" className="w-full max-h-[55vh] object-contain rounded-lg bg-slate-50" />

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Refine this image</p>
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
                        Undo
                      </Button>
                    )}
                    <span className="text-xs text-slate-500">Costs 1 credit</span>
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
                    placeholder="e.g. crop tighter, add soft shadows, change to outdoor scene..."
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
                    <Sparkles className="h-4 w-4 mr-2" />Refine
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameFolderId} onOpenChange={() => setRenameFolderId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Rename Folder</DialogTitle></DialogHeader>
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
        <DialogContent className="max-w-xl">
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
    </div>
  );
}
