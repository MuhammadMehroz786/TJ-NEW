import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GenerateInputSchema,
  GOALS,
  LANGUAGES,
  PLATFORMS,
  TONES,
  type GenerateInput,
} from "@/types/contentAgent";

interface Props {
  initial?: Partial<GenerateInput>;
  busy: boolean;
  onSubmit: (input: GenerateInput) => void;
}

export function GenerateForm({ initial, busy, onSubmit }: Props) {
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [tone, setTone] = useState<GenerateInput["tone"]>(initial?.tone ?? "playful");
  const [goal, setGoal] = useState<GenerateInput["goal"]>(initial?.goal ?? "awareness");
  const [language, setLanguage] = useState<GenerateInput["language"]>(initial?.language ?? "ar");
  const [platforms, setPlatforms] = useState<GenerateInput["platforms"]>(
    initial?.platforms ?? ["tiktok"],
  );

  const candidate = { topic, tone, goal, language, platforms };
  const parsed = GenerateInputSchema.safeParse(candidate);
  const canSubmit = parsed.success && !busy;
  const firstError = parsed.success ? null : parsed.error.issues[0]?.message ?? null;

  function togglePlatform(p: GenerateInput["platforms"][number]) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (parsed.success) onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="ca-topic">Topic</Label>
        <textarea
          id="ca-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. New abaya line launch — focus on premium fabric"
          rows={3}
          maxLength={500}
          className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <p className="text-xs text-slate-500 mt-1">{topic.length} / 500</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tone</Label>
          <Select value={tone} onValueChange={(v) => setTone(v as GenerateInput["tone"])}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Goal</Label>
          <Select value={goal} onValueChange={(v) => setGoal(v as GenerateInput["goal"])}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GOALS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Language</Label>
        <div className="flex gap-2 mt-1">
          {LANGUAGES.map((l) => (
            <Button
              key={l}
              type="button"
              variant={language === l ? "default" : "outline"}
              size="sm"
              onClick={() => setLanguage(l)}
            >
              {l.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label>Platforms</Label>
        <div className="flex gap-3 mt-1">
          {PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
              <input
                type="checkbox"
                checked={platforms.includes(p)}
                onChange={() => togglePlatform(p)}
                className="accent-teal-600"
              />
              {p}
            </label>
          ))}
        </div>
      </div>

      {firstError && topic.length > 0 && (
        <p className="text-xs text-red-600">{firstError}</p>
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {busy ? "Drafting…" : "Generate"}
      </Button>
    </form>
  );
}
