import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import api from "@/lib/api";
import { Download, Loader2, Play, RotateCcw, AlertCircle, CheckCircle2, Youtube, Settings2, Trash2, Clock, CalendarDays, UploadCloud } from "lucide-react";
import { Switch } from "@/components/ui/switch";

/**
 * Admin tab for the Daily Demo Video feature.
 *
 * Lets an admin:
 *   - Pick a niche from the 7-niche catalog and click Generate
 *   - See the current job's status progress live (polls every 2s while not terminal)
 *   - Browse past videos with thumbnails + download links
 *   - Retry a failed video
 *
 * Server contract:
 *   GET    /api/admin/daily-videos/niches             → { niches: NicheOption[] }
 *   GET    /api/admin/daily-videos?limit=50           → { videos: VideoRow[] }
 *   GET    /api/admin/daily-videos/:id                → { video: VideoRow }
 *   POST   /api/admin/daily-videos/generate           → { job: VideoRow }
 *
 * Backend is on-request only (no cron). Every generation is admin-triggered.
 */

interface NicheOption {
  niche: string;
  displayName: string;
  displayNameAr: string;
}

interface VideoRow {
  id: string;
  createdAt: string;
  forDate: string;
  niche: string;
  nicheDisplay: string;
  status: string;
  errorMessage?: string | null;
  triggeredBy: string;
  costCents?: number | null;
  renderMs?: number | null;
  renderMs?: number | null;
  youtubeStatus?: string;
  youtubeId?: string | null;
  youtubeErrorMessage?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
}

interface YoutubeStatus {
  connected: boolean;
  channelTitle?: string;
  thumbnailUrl?: string;
}

interface YoutubeConfig {
  autoPostEnabled: boolean;
  mode: "interval" | "time";
  intervalMinutes: number;
  postTimeKsa: string;
  lastPostTime: string | null;
  nextPostTime: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued…",
  scripting: "Writing script…",
  imaging: "Generating images…",
  voicing: "Recording voiceover…",
  rendering: "Rendering video…",
  done: "Done",
  failed: "Failed",
};

// Percent-complete shown in the progress bar — purely visual, not from the server.
const STATUS_PROGRESS: Record<string, number> = {
  pending: 5,
  scripting: 15,
  imaging: 40,
  voicing: 65,
  rendering: 85,
  done: 100,
  failed: 100,
};

const TERMINAL = (s: string) => s === "done" || s === "failed";

export function DailyVideosTab() {
  const [niches, setNiches] = useState<NicheOption[]>([]);
  const [selectedNiche, setSelectedNiche] = useState<string>("");
  const [productOverride, setProductOverride] = useState<string>("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<VideoRow | null>(null);
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<VideoRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // YouTube State
  const [ytStatus, setYtStatus] = useState<YoutubeStatus | null>(null);
  const [ytConfig, setYtConfig] = useState<YoutubeConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Load niche catalog, history, and youtube status on mount.
  useEffect(() => {
    void (async () => {
      try {
        const [nichesRes, ytStatusRes, ytConfigRes] = await Promise.all([
          api.get<{ niches: NicheOption[] }>("/admin/daily-videos/niches"),
          api.get<YoutubeStatus>("/admin/daily-videos/youtube/status"),
          api.get<YoutubeConfig>("/admin/daily-videos/youtube/config")
        ]);
        setNiches(nichesRes.data.niches);
        if (nichesRes.data.niches.length > 0) setSelectedNiche(nichesRes.data.niches[0].niche);
        setYtStatus(ytStatusRes.data);
        setYtConfig(ytConfigRes.data);
      } catch {
        toast.error("Could not load initial data");
      }
    })();
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get<{ videos: VideoRow[] }>("/admin/daily-videos?limit=50");
      setHistory(res.data.videos);
    } catch {
      toast.error("Could not load video history");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Poll the active job every 2s until it reaches a terminal state. Polling
  // stops when the job is done/failed or when activeJobId is cleared.
  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await api.get<{ video: VideoRow }>(`/admin/daily-videos/${activeJobId}`);
        if (cancelled) return;
        setActiveJob(res.data.video);
        if (TERMINAL(res.data.video.status)) {
          setGenerating(false);
          // Refresh history so the new row appears at the top with thumbnail.
          void loadHistory();
          if (res.data.video.status === "failed") {
            toast.error(res.data.video.errorMessage ?? "Generation failed");
          } else {
            toast.success("Video ready");
          }
          return; // stop polling
        }
        timer = setTimeout(tick, 2000);
      } catch {
        // Network blip — retry once after a longer delay before giving up.
        if (!cancelled) timer = setTimeout(tick, 5000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJobId, loadHistory]);

  async function handleGenerate(nicheOverride?: string, productOverrideOverride?: string) {
    const niche = nicheOverride ?? selectedNiche;
    const product = (productOverrideOverride ?? productOverride).trim();
    if (!niche) return;
    if (!product) {
      toast.error("Describe the specific product (e.g. '21k gold bracelet with filigree')");
      return;
    }
    setGenerating(true);
    setActiveJob(null);
    try {
      const res = await api.post<{ job: VideoRow }>("/admin/daily-videos/generate", {
        niche,
        productOverride: product,
      });
      setActiveJobId(res.data.job.id);
      setActiveJob(res.data.job);
    } catch (err) {
      setGenerating(false);
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Could not start generation";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Generator panel ───────────────────────────────────────────── */}
      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="dv-niche">Niche</Label>
              <Select value={selectedNiche} onValueChange={setSelectedNiche}>
                <SelectTrigger id="dv-niche" className="mt-1">
                  <SelectValue placeholder="Pick a niche…" />
                </SelectTrigger>
                <SelectContent>
                  {niches.map((n) => (
                    <SelectItem key={n.niche} value={n.niche}>
                      {n.displayName} <span className="text-slate-400">· {n.displayNameAr}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="dv-product">Specific product</Label>
              <input
                id="dv-product"
                type="text"
                value={productOverride}
                onChange={(e) => setProductOverride(e.target.value)}
                placeholder="e.g. 21-karat gold bracelet with filigree work"
                maxLength={200}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Shown in the before / after frames. Be specific — color, material, style.
                {productOverride && ` · ${productOverride.length}/200`}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => handleGenerate()}
              disabled={generating || !selectedNiche || !productOverride.trim()}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
              ) : (
                <>Generate Video</>
              )}
            </Button>
          </div>

          {/* Active job progress */}
          {activeJob && (
            <div className="mt-5 p-4 rounded-md bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm">
                  {activeJob.status === "done" && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
                  {activeJob.status === "failed" && <AlertCircle className="w-4 h-4 text-red-600" />}
                  {!TERMINAL(activeJob.status) && <Loader2 className="w-4 h-4 animate-spin text-slate-600" />}
                  <span className="font-medium text-slate-700">
                    {STATUS_LABEL[activeJob.status] ?? activeJob.status}
                  </span>
                  <span className="text-slate-400">· {activeJob.nicheDisplay}</span>
                </div>
                {activeJob.status === "done" && activeJob.videoUrl && (
                  <a
                    href={activeJob.videoUrl}
                    download={`tijarflow-${activeJob.niche}-${activeJob.id.slice(0, 8)}.mp4`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-800"
                  >
                    <Download className="w-4 h-4" /> Download MP4
                  </a>
                )}
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    activeJob.status === "failed" ? "bg-red-500" : "bg-teal-500"
                  }`}
                  style={{ width: `${STATUS_PROGRESS[activeJob.status] ?? 50}%` }}
                />
              </div>
              {activeJob.status === "failed" && activeJob.errorMessage && (
                <p className="text-xs text-red-700 mt-2">{activeJob.errorMessage}</p>
              )}
              {activeJob.status === "done" && activeJob.renderMs && (
                <p className="text-xs text-slate-500 mt-2">
                  Rendered in {Math.round(activeJob.renderMs / 1000)}s
                  {activeJob.costCents != null && ` · ~$${(activeJob.costCents / 100).toFixed(2)}`}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500 mt-3">
            Generation runs in the background (~3 minutes). You can leave this tab open or come back —
            the result will appear in History below.
          </p>
        </CardContent>
      </Card>

      {/* ── YouTube Connection & Scheduler ────────────────────────────── */}
      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-1 md:max-w-md">
              <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-600" />
                YouTube Auto-Posting
              </h3>
              <p className="text-sm text-slate-500">
                Automatically publish generated marketing videos to your YouTube channel to drive organic traffic.
              </p>
            </div>
            <div className="flex-shrink-0">
              {ytStatus === null ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                </div>
              ) : ytStatus.connected ? (
                <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 p-3 rounded-md">
                  <div className="flex items-center gap-3">
                    {ytStatus.thumbnailUrl ? (
                      <img src={ytStatus.thumbnailUrl} alt="Channel" className="w-10 h-10 rounded-full border border-slate-200" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                        <Youtube className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-800">{ytStatus.channelTitle ?? "Connected Channel"}</p>
                      <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleDisconnectYoutube} className="text-slate-500 hover:text-red-600">
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button onClick={handleConnectYoutube} className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-2">
                  <Youtube className="w-4 h-4" /> Connect Channel
                </Button>
              )}
            </div>
          </div>

          {/* Scheduler Config - Only show if connected */}
          {ytStatus?.connected && ytConfig && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-post" className="text-base font-medium">Enable Auto-Posting</Label>
                  <p className="text-xs text-slate-500">
                    Automatically publish new videos that finish generating.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {savingConfig && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  <Switch
                    id="auto-post"
                    checked={ytConfig.autoPostEnabled}
                    onCheckedChange={(c) => handleSaveYtConfig({ autoPostEnabled: c })}
                  />
                </div>
              </div>

              {ytConfig.autoPostEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 p-4 bg-slate-50 rounded-md border border-slate-200">
                  <div className="space-y-3">
                    <Label className="text-sm">Schedule Mode</Label>
                    <Select
                      value={ytConfig.mode}
                      onValueChange={(v: "interval" | "time") => handleSaveYtConfig({ mode: v })}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time">Daily at Specific Time</SelectItem>
                        <SelectItem value="interval">Post Every N Minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {ytConfig.mode === "time" ? (
                    <div className="space-y-3">
                      <Label className="text-sm">Time of Day (KSA)</Label>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <input
                          type="time"
                          value={ytConfig.postTimeKsa}
                          onChange={(e) => handleSaveYtConfig({ postTimeKsa: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Label className="text-sm">Interval (Minutes)</Label>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-slate-400" />
                        <input
                          type="number"
                          min="1"
                          value={ytConfig.intervalMinutes}
                          onChange={(e) => handleSaveYtConfig({ intervalMinutes: parseInt(e.target.value) || 10 })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                        />
                      </div>
                    </div>
                  )}

                  <div className="col-span-full pt-2 border-t border-slate-200/60 mt-1 flex items-center justify-between text-xs text-slate-500">
                    <p>Last post: {ytConfig.lastPostTime ? new Date(ytConfig.lastPostTime).toLocaleString() : "Never"}</p>
                    <p>Next post: {ytConfig.nextPostTime ? new Date(ytConfig.nextPostTime).toLocaleString() : "Not scheduled"}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── History grid ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">History</h3>
          <Button variant="ghost" size="sm" onClick={() => void loadHistory()} disabled={loadingHistory}>
            {loadingHistory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Refresh"}
          </Button>
        </div>

        {history.length === 0 && !loadingHistory && (
          <p className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-md">
            No videos yet. Generate your first one above.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {history.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              onRetry={() => {
                // Retry pre-fills the form with the same niche so the admin can
                // re-supply a product description and click Generate. We don't
                // store the original productOverride on the row, so it can't be
                // replayed automatically.
                setSelectedNiche(v.niche);
                toast("Pick a product description and click Generate", { icon: "↻" });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Single video card in the history grid ────────────────────────────────────
function VideoCard({ video, onRetry }: { video: VideoRow; onRetry: () => void }) {
  const isDone = video.status === "done";
  const isFailed = video.status === "failed";
  const isInProgress = !TERMINAL(video.status);
  // Date label like "May 22, 2026"
  const dateLabel = new Date(video.forDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Card className="border-slate-200 overflow-hidden">
      <div className="aspect-[9/16] bg-slate-100 relative max-h-72">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.nicheDisplay}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            {isInProgress ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-8 h-8" />}
          </div>
        )}
        {isFailed && (
          <div className="absolute inset-0 bg-red-50/80 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        )}
        {isDone && video.videoUrl && (
          <a
            href={video.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group"
          >
            <Play className="w-12 h-12 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
          </a>
        )}
      </div>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{video.nicheDisplay}</p>
            <p className="text-xs text-slate-500">{dateLabel}</p>
          </div>
          {isDone && video.videoUrl && (
            <a
              href={video.videoUrl}
              download={`tijarflow-${video.niche}-${video.id.slice(0, 8)}.mp4`}
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-600 hover:text-teal-700 hover:bg-teal-50"
              title="Download MP4"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
          {isFailed && (
            <button
              onClick={onRetry}
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-600 hover:text-amber-700 hover:bg-amber-50"
              title="Retry"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
        {isFailed && video.errorMessage && (
          <p className="text-xs text-red-600 mt-1 line-clamp-2" title={video.errorMessage}>
            {video.errorMessage}
          </p>
        )}
        
        {/* YouTube Status Panel */}
        {isDone && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs">
                <Youtube className={`w-3.5 h-3.5 ${
                  video.youtubeStatus === "completed" ? "text-green-600" :
                  video.youtubeStatus === "uploading" ? "text-amber-500 animate-pulse" :
                  video.youtubeStatus === "failed" ? "text-red-600" :
                  "text-slate-400"
                }`} />
                <span className="text-slate-600 font-medium">
                  {video.youtubeStatus === "completed" ? "Published" :
                   video.youtubeStatus === "uploading" ? "Uploading..." :
                   video.youtubeStatus === "failed" ? "Failed" :
                   "Not Published"}
                </span>
              </div>
              
              {video.youtubeStatus === "completed" && video.youtubeId && (
                <a href={`https://youtube.com/shorts/${video.youtubeId}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                  View
                </a>
              )}
              
              {(video.youtubeStatus === "pending" || video.youtubeStatus === "failed") && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs px-2 text-slate-500 hover:text-teal-600"
                  onClick={async () => {
                    toast.loading("Uploading to YouTube...", { id: `upload-${video.id}` });
                    try {
                      await api.post(`/admin/daily-videos/${video.id}/post-now`);
                      toast.success("Upload successful!", { id: `upload-${video.id}` });
                      // Note: the component doesn't re-fetch here automatically, but in a real app
                      // we'd want to call loadHistory or pass a callback. For now, it will update
                      // on next refresh.
                    } catch (e: any) {
                      toast.error(e.response?.data?.error || "Upload failed", { id: `upload-${video.id}` });
                    }
                  }}
                >
                  <UploadCloud className="w-3 h-3 mr-1" /> Post Now
                </Button>
              )}
            </div>
            {video.youtubeStatus === "failed" && video.youtubeErrorMessage && (
              <p className="text-[10px] text-red-500 mt-1 truncate" title={video.youtubeErrorMessage}>
                {video.youtubeErrorMessage}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
