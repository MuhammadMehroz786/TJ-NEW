import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

interface Scene {
  scene: number;
  timecode: string;
  shot: string;
}

interface Props {
  scenes: Scene[];
  dir: "ltr" | "rtl";
}

export function StoryboardTable({ scenes, dir }: Props) {
  async function copyAll() {
    const text = scenes
      .map((s) => `Scene ${s.scene} (${s.timecode}): ${s.shot}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast.success("Storyboard copied");
  }
  return (
    <div className="space-y-2" dir={dir}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Storyboard</h3>
        <Button variant="ghost" size="sm" onClick={copyAll}>
          <Copy className="h-3 w-3 mr-1" />
          Copy all
        </Button>
      </div>
      <table className="w-full text-sm border border-slate-200 rounded">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-start p-2 w-12">#</th>
            <th className="text-start p-2 w-24">Time</th>
            <th className="text-start p-2">Shot</th>
          </tr>
        </thead>
        <tbody>
          {scenes.map((s) => (
            <tr key={s.scene} className="border-t border-slate-200">
              <td className="p-2 align-top">{s.scene}</td>
              <td className="p-2 align-top whitespace-nowrap">{s.timecode}</td>
              <td className="p-2">{s.shot}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
