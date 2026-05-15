import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { toast } from "sonner";
import type { ContentDraft, Language, Platform } from "@/types/contentAgent";
import { LANGUAGES, PLATFORMS } from "@/types/contentAgent";

interface Props {
  onOpen: (draft: ContentDraft) => void;
  onDuplicate: (draft: ContentDraft) => void;
  // Bumped externally after a successful generation so the list re-fetches and
  // shows the new row at the top without the parent having to share state.
  refreshKey: number;
}

export function HistoryList({ onOpen, onDuplicate, refreshKey }: Props) {
  const [items, setItems] = useState<ContentDraft[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language | "all">("all");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = { limit: 20 };
        if (!reset && cursor) params.cursor = cursor;
        if (language !== "all") params.language = language;
        if (platform !== "all") params.platform = platform;
        if (q.trim()) params.q = q.trim();
        const res = await api.get("/admin/content-agent/history", { params });
        const next = res.data.items as ContentDraft[];
        setItems((prev) => (reset ? next : [...prev, ...next]));
        setCursor(res.data.nextCursor);
      } catch {
        toast.error("Could not load history");
      } finally {
        setLoading(false);
      }
    },
    [cursor, language, platform, q],
  );

  // Initial load + reset on filter changes / refresh signal. cursor itself is
  // not in the deps to avoid re-fetching after pagination updates it.
  useEffect(() => {
    setCursor(null);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, platform, q, refreshKey]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search topic…"
          className="max-w-xs"
        />
        <Select value={language} onValueChange={(v) => setLanguage(v as Language | "all")}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Lang" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All langs</SelectItem>
            {LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                {l.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={platform} onValueChange={(v) => setPlatform(v as Platform | "all")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ul className="divide-y divide-slate-200 border border-slate-200 rounded">
        {items.length === 0 && !loading && (
          <li className="p-3 text-sm text-slate-500">No drafts yet.</li>
        )}
        {items.map((d) => (
          <li key={d.id} className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">
                {new Date(d.createdAt).toLocaleString()} · {d.language.toUpperCase()} ·{" "}
                {d.platforms.join(", ")}
              </p>
              <p className="text-sm truncate">{d.topic}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => onOpen(d)}>
                Open
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDuplicate(d)}>
                Duplicate
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {cursor && (
        <Button variant="outline" size="sm" onClick={() => load(false)} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
