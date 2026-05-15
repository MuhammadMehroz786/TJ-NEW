import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  script: string;
  dir: "ltr" | "rtl";
}

export function ScriptBlock({ script, dir }: Props) {
  async function copy() {
    await navigator.clipboard.writeText(script);
    toast.success("Script copied");
  }
  return (
    <div className="space-y-2" dir={dir}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Script</h3>
        <Button variant="ghost" size="sm" onClick={copy}>
          <Copy className="h-3 w-3 mr-1" />
          Copy
        </Button>
      </div>
      <pre className="whitespace-pre-wrap text-sm border border-slate-200 rounded p-3 bg-slate-50 font-sans">
        {script}
      </pre>
    </div>
  );
}
