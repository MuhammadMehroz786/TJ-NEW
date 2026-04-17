// Module-scoped background job queue for AI Studio enhance/refine operations.
// Jobs survive component unmount and dialog close — the page can be closed but
// an already-started API request continues in the background. Subscribers get
// live updates on pending count + completed results.

import api from "@/lib/api";

export interface AiStudioImage {
  id: string;
  imageUrl: string;
  background: string;
  createdAt: string;
  folder?: { id: string; name: string } | null;
}

type JobType = "enhance" | "refine";

export interface Job {
  id: string;
  type: JobType;
  label: string;
  startedAt: number;
}

interface JobResultSuccess {
  type: "success";
  job: Job;
  result: AiStudioImage;
  remainingCredits?: number;
  weeklyCredits?: number;
  purchasedCredits?: number;
  refineSourceImageId?: string; // for refine jobs — the source image id
}

interface JobResultError {
  type: "error";
  job: Job;
  error: string;
}

type JobResult = JobResultSuccess | JobResultError;

type Listener = () => void;
type ResultListener = (result: JobResult) => void;

const pendingJobs = new Map<string, Job>();
const listeners = new Set<Listener>();
const resultListeners = new Set<ResultListener>();

function emitChange() {
  listeners.forEach((l) => {
    try { l(); } catch { /* swallow */ }
  });
}

function emitResult(result: JobResult) {
  resultListeners.forEach((l) => {
    try { l(result); } catch { /* swallow */ }
  });
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeToResults(listener: ResultListener): () => void {
  resultListeners.add(listener);
  return () => resultListeners.delete(listener);
}

export function getPendingJobs(): Job[] {
  return Array.from(pendingJobs.values());
}

export function getPendingCount(): number {
  return pendingJobs.size;
}

function uid(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractError(err: unknown): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Request failed";
}

export function startEnhanceJob(params: {
  image: string;
  background: string;
  folderId: string | null;
  label?: string;
}): Job {
  const job: Job = {
    id: uid(),
    type: "enhance",
    label: params.label || "Enhancing image",
    startedAt: Date.now(),
  };
  pendingJobs.set(job.id, job);
  emitChange();

  api
    .post("/ai-studio/enhance", {
      image: params.image,
      background: params.background,
      folderId: params.folderId,
    }, { timeout: 180000 })
    .then((res) => {
      pendingJobs.delete(job.id);
      emitChange();
      emitResult({
        type: "success",
        job,
        result: res.data,
        remainingCredits: res.data?.remainingCredits,
        weeklyCredits: res.data?.weeklyCredits,
        purchasedCredits: res.data?.purchasedCredits,
      });
    })
    .catch((err: unknown) => {
      pendingJobs.delete(job.id);
      emitChange();
      emitResult({ type: "error", job, error: extractError(err) });
    });

  return job;
}

export function startRefineJob(params: {
  imageId: string;
  instruction: string;
  label?: string;
}): Job {
  const job: Job = {
    id: uid(),
    type: "refine",
    label: params.label || "Refining image",
    startedAt: Date.now(),
  };
  pendingJobs.set(job.id, job);
  emitChange();

  api
    .post("/ai-studio/refine", {
      imageId: params.imageId,
      instruction: params.instruction,
    }, { timeout: 180000 })
    .then((res) => {
      pendingJobs.delete(job.id);
      emitChange();
      emitResult({
        type: "success",
        job,
        result: res.data,
        remainingCredits: res.data?.remainingCredits,
        weeklyCredits: res.data?.weeklyCredits,
        purchasedCredits: res.data?.purchasedCredits,
        refineSourceImageId: params.imageId,
      });
    })
    .catch((err: unknown) => {
      pendingJobs.delete(job.id);
      emitChange();
      emitResult({ type: "error", job, error: extractError(err) });
    });

  return job;
}
