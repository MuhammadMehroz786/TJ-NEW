-- Clean up products whose titles still carry a literal "(AI)" suffix from
-- the old bulk-enhance "save as new" behavior. We now express AI provenance
-- via the "ai-enhanced" tag instead of mangling the title.
--
-- For every product whose title ends in " (AI)":
--   1. strip the suffix so marketplace pushes / search stay clean
--   2. ensure the "ai-enhanced" tag is present on that row
UPDATE "Product"
SET
  "title" = TRIM(regexp_replace("title", '\s*\(AI\)\s*$', '')),
  "tags" = CASE
    WHEN "tags" @> '["ai-enhanced"]'::jsonb THEN "tags"
    ELSE COALESCE("tags", '[]'::jsonb) || '["ai-enhanced"]'::jsonb
  END
WHERE "title" ~ '\s*\(AI\)\s*$';
