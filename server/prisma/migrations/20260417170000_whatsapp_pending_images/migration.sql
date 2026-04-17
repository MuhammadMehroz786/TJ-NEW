-- Holds inbound Meta media IDs collected during the 5s batch window, awaiting
-- the user's theme reply. Applied per-session so it survives PM2 restarts
-- (complementing the in-memory debounce).
ALTER TABLE "WhatsAppSession"
  ADD COLUMN "pendingImageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
