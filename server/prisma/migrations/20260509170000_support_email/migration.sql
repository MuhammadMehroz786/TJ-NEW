-- SupportEmail: log of every inbound email the IMAP poller picked up,
-- the classification + skip reason, and (when phase 2 enables sending)
-- the would-be reply body + sentAt timestamp.
CREATE TABLE "SupportEmail" (
    "id" TEXT NOT NULL,
    "imapUid" INTEGER NOT NULL,
    "messageId" TEXT,
    "threadId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "language" TEXT,
    "classifiedAction" TEXT NOT NULL,
    "skippedReason" TEXT,
    "generatedReply" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportEmail_imapUid_key" ON "SupportEmail"("imapUid");
CREATE INDEX "SupportEmail_receivedAt_idx" ON "SupportEmail"("receivedAt");
CREATE INDEX "SupportEmail_fromAddress_idx" ON "SupportEmail"("fromAddress");
CREATE INDEX "SupportEmail_classifiedAction_idx" ON "SupportEmail"("classifiedAction");
