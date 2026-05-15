import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { Platform } from "@/types/contentAgent";

interface CaptionEntry {
  caption: string;
  hashtags: string[];
}

interface Props {
  captions: Partial<Record<Platform, CaptionEntry>>;
  dir: "ltr" | "rtl";
}

const LABEL: Record<Platform, string> = {
  tiktok: "TikTok",
  reels: "Reels",
  shorts: "Shorts",
};

export function CaptionTabs({ captions, dir }: Props) {
  const platforms = (Object.keys(captions) as Platform[]).filter((p) => captions[p]);
  const [active, setActive] = useState<Platform | undefined>(platforms[0]);

  if (!active) return null;
  const entry = captions[active]!;

  async function copyCaption() {
    await navigator.clipboard.writeText(entry.caption);
    toast.success("Caption copied");
  }
  async function copyHashtags() {
    await navigator.clipboard.writeText(entry.hashtags.map((h) => `#${h}`).join(" "));
    toast.success("Hashtags copied");
  }

  return (
    <div className="space-y-2" dir={dir}>
      <h3 className="text-sm font-semibold text-slate-700">Captions</h3>
      <div className="border-b border-slate-200 flex items-center gap-0">
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setActive(p)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === p
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {LABEL[p]}
          </button>
        ))}
      </div>
      <div className="space-y-2 pt-2">
        <div className="border border-slate-200 rounded p-2">
          <div className="flex justify-between items-start gap-2">
            <p className="flex-1 text-sm whitespace-pre-wrap">{entry.caption}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={copyCaption}
              aria-label="Copy caption"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="border border-slate-200 rounded p-2">
          <div className="flex justify-between items-start gap-2">
            <div className="flex flex-wrap gap-1 flex-1">
              {entry.hashtags.map((h, i) => (
                <span
                  key={i}
                  className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700"
                >
                  #{h}
                </span>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={copyHashtags}
              aria-label="Copy hashtags"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
