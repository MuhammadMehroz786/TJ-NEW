import { useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { GenerateForm } from "./GenerateForm";
import { ResultPanel } from "./ResultPanel";
import { HistoryList } from "./HistoryList";
import type { ContentDraft, GenerateInput } from "@/types/contentAgent";

// Pulls the input snapshot out of a draft so the form can be prefilled either
// for Duplicate (no parentId) or Regenerate (parentId set).
function inputFromDraft(draft: ContentDraft): Partial<GenerateInput> {
  return {
    topic: draft.topic,
    tone: draft.tone,
    goal: draft.goal,
    language: draft.language,
    platforms: draft.platforms,
  };
}

export function ContentAgentTab() {
  const [current, setCurrent] = useState<ContentDraft | null>(null);
  const [formSeed, setFormSeed] = useState<Partial<GenerateInput> | undefined>();
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function submit(input: GenerateInput, parentId?: string) {
    setBusy(true);
    try {
      const body = parentId ? { ...input, parentId } : input;
      const res = await api.post<ContentDraft>("/admin/content-agent/generate", body);
      setCurrent(res.data);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Generation failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2">
          <GenerateForm
            initial={formSeed}
            busy={busy}
            onSubmit={(input) => submit(input)}
          />
        </div>
        <div className="md:col-span-3">
          <ResultPanel
            draft={current}
            busy={busy}
            onRegenerate={() => {
              if (!current) return;
              void submit(inputFromDraft(current) as GenerateInput, current.id);
            }}
          />
        </div>
      </div>
      <HistoryList
        refreshKey={refreshKey}
        onOpen={(d) => setCurrent(d)}
        onDuplicate={(d) => {
          setFormSeed(inputFromDraft(d));
          setCurrent(null);
        }}
      />
    </div>
  );
}
