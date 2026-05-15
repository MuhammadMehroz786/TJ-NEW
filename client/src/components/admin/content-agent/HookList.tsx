import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  hooks: string[];
  dir: "ltr" | "rtl";
}

export function HookList({ hooks, dir }: Props) {
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  }
  return (
    <div className="space-y-2" dir={dir}>
      <h3 className="text-sm font-semibold text-slate-700">Hooks</h3>
      {hooks.map((h, i) => (
        <div key={i} className="flex items-start gap-2 border border-slate-200 rounded p-2">
          <p className="flex-1 text-sm">{h}</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => copy(h)}
            aria-label="Copy hook"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
