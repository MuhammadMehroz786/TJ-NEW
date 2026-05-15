import { Button } from "@/components/ui/button";
import { HookList } from "./HookList";
import { ScriptBlock } from "./ScriptBlock";
import { StoryboardTable } from "./StoryboardTable";
import { CaptionTabs } from "./CaptionTabs";
import type { ContentDraft } from "@/types/contentAgent";

interface Props {
  draft: ContentDraft | null;
  onRegenerate: () => void;
  busy: boolean;
}

export function ResultPanel({ draft, onRegenerate, busy }: Props) {
  if (!draft) {
    return (
      <div className="border border-slate-200 rounded-lg p-6 text-sm text-slate-500">
        Fill in the form and click <strong>Generate</strong> to draft a short-form concept.
      </div>
    );
  }

  // RTL is driven by the DRAFT's language, not the surrounding UI language.
  // An admin can browse an English UI while reviewing an Arabic draft.
  const dir: "ltr" | "rtl" = draft.language === "ar" ? "rtl" : "ltr";

  return (
    <div className="space-y-4 border border-slate-200 rounded-lg p-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs text-slate-500 uppercase">
            {draft.language} · {draft.platforms.join(" · ")}
          </p>
          <p className="font-medium text-slate-800">{draft.topic}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={busy}>
          {busy ? "…" : "Regenerate"}
        </Button>
      </div>
      <HookList hooks={draft.hooks} dir={dir} />
      <ScriptBlock script={draft.script} dir={dir} />
      <StoryboardTable scenes={draft.storyboard} dir={dir} />
      <CaptionTabs captions={draft.captions} dir={dir} />
    </div>
  );
}
