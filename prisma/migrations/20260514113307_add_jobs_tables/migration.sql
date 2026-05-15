-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'processing', 'done', 'failed');

-- AlterTable
ALTER TABLE "vhr_reports" ADD COLUMN     "application" VARCHAR(64),
ADD COLUMN     "user_id" INTEGER;

-- CreateTable
CREATE TABLE "scrape_jobs" (
    "id" TEXT NOT NULL,
    "vin" VARCHAR(17) NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "user_id" INTEGER,
    "application" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_code" VARCHAR(64),
    "error" TEXT,
    "metadata" JSONB,
    "callback_url" VARCHAR(1000),
    "callback_attempts" INTEGER NOT NULL DEFAULT 0,
    "callback_delivered_at" TIMESTAMP(3),
    "next_callback_at" TIMESTAMP(3),
    "vhr_report_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scrape_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_clients" (
    "id" SERIAL NOT NULL,
    "application" VARCHAR(64) NOT NULL,
    "api_key_hash" VARCHAR(128) NOT NULL,
    "webhook_secret" VARCHAR(128) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "api_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scrape_jobs_status_next_attempt_at_idx" ON "scrape_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "scrape_jobs_application_user_id_created_at_idx" ON "scrape_jobs"("application", "user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scrape_jobs_vin_idx" ON "scrape_jobs"("vin");

-- CreateIndex
CREATE INDEX "scrape_jobs_callback_url_callback_delivered_at_next_callbac_idx" ON "scrape_jobs"("callback_url", "callback_delivered_at", "next_callback_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_application_key" ON "api_clients"("application");

-- CreateIndex
CREATE UNIQUE INDEX "api_clients_api_key_hash_key" ON "api_clients"("api_key_hash");

-- CreateIndex
CREATE INDEX "api_clients_api_key_hash_idx" ON "api_clients"("api_key_hash");

-- AddForeignKey
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_vhr_report_id_fkey" FOREIGN KEY ("vhr_report_id") REFERENCES "vhr_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
