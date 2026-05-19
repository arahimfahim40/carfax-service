-- Convert `application` columns from VarChar to the new application_type enum.
-- All existing 'admin' values map cleanly; NULLs are preserved on nullable cols.

-- 1) Create the enum
CREATE TYPE "application_type" AS ENUM ('admin', 'customer_portal', 'client');

-- 2) Drop the unique constraint on api_clients.application (no longer unique;
--    `application` is now a category, multiple keys may share the same value).
ALTER TABLE "api_clients"
  DROP CONSTRAINT IF EXISTS "api_clients_application_key";

-- 3) Convert each column with an explicit USING cast (preserves data).
ALTER TABLE "scrape_jobs"
  ALTER COLUMN "application" TYPE "application_type"
  USING "application"::text::"application_type";

ALTER TABLE "vhr_reports"
  ALTER COLUMN "application" TYPE "application_type"
  USING "application"::text::"application_type";

ALTER TABLE "api_clients"
  ALTER COLUMN "application" TYPE "application_type"
  USING "application"::text::"application_type";
