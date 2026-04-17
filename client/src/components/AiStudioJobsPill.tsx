import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getPendingJobs, subscribe, type Job } from "@/lib/aiStudioJobs";

export function AiStudioJobsPill() {
  const [jobs, setJobs] = useState<Job[]>(getPendingJobs());

  useEffect(() => subscribe(() => setJobs(getPendingJobs())), []);

  if (jobs.length === 0) return null;

  const primary = jobs[0];
  const extra = jobs.length - 1;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full border border-teal-200 bg-white/95 pl-4 pr-5 py-2.5 shadow-lg backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
      <div className="text-sm">
        <span className="font-medium text-slate-900">{primary.label}</span>
        {extra > 0 && (
          <span className="ml-2 text-xs text-slate-500">+{extra} more</span>
        )}
      </div>
    </div>
  );
}
