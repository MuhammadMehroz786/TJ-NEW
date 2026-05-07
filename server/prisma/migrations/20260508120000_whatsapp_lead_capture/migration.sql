-- WhatsAppSession: capture profile name + first-seen + lead category for outreach
ALTER TABLE "WhatsAppSession" ADD COLUMN "profileName" TEXT;
ALTER TABLE "WhatsAppSession" ADD COLUMN "leadCategory" TEXT;
ALTER TABLE "WhatsAppSession" ADD COLUMN "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- WhatsAppMessage: full inbound + outbound message log per session
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "wamid" TEXT,
    "messageType" TEXT NOT NULL,
    "body" TEXT,
    "mediaUrl" TEXT,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMessage_wamid_key" ON "WhatsAppMessage"("wamid");
CREATE INDEX "WhatsAppMessage_sessionId_createdAt_idx" ON "WhatsAppMessage"("sessionId", "createdAt");

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
