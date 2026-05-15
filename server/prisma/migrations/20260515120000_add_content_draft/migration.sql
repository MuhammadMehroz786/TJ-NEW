-- ContentDraft: admin-only short-form content agent drafts. One row per
-- generation; failed attempts kept for debugging (status="failed" +
-- failureReason). Versioning via self-relation on parentId.
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "platforms" TEXT[],
    "hooks" JSONB NOT NULL,
    "script" TEXT NOT NULL,
    "storyboard" JSONB NOT NULL,
    "captions" JSONB NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "failureReason" TEXT,
    "parentId" TEXT,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentDraft_createdAt_idx" ON "ContentDraft"("createdAt");
CREATE INDEX "ContentDraft_createdById_idx" ON "ContentDraft"("createdById");

ALTER TABLE "ContentDraft"
    ADD CONSTRAINT "ContentDraft_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentDraft"
    ADD CONSTRAINT "ContentDraft_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "ContentDraft"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
