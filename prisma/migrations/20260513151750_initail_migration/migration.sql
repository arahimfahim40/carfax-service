-- CreateEnum
CREATE TYPE "request_status" AS ENUM ('pending', 'success', 'error');

-- CreateTable
CREATE TABLE "request_logs" (
    "id" SERIAL NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "query_params" JSONB,
    "request_ip" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "status" "request_status" NOT NULL DEFAULT 'pending',
    "http_status" INTEGER,
    "vin" VARCHAR(17),
    "logged_in" BOOLEAN,
    "used_existing_session" BOOLEAN,
    "mfa_triggered" BOOLEAN,
    "captcha_triggered" BOOLEAN,
    "vhr_report_id" INTEGER,
    "error_code" VARCHAR(64),
    "error_message" TEXT,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vhr_reports" (
    "id" SERIAL NOT NULL,
    "vin" VARCHAR(17) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "json_payload" JSONB NOT NULL,
    "pdf_name" VARCHAR(255) NOT NULL,
    "pdf_url" VARCHAR(1000) NOT NULL,

    CONSTRAINT "vhr_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "request_logs_started_at_idx" ON "request_logs"("started_at" DESC);

-- CreateIndex
CREATE INDEX "request_logs_vin_idx" ON "request_logs"("vin");

-- CreateIndex
CREATE INDEX "request_logs_status_idx" ON "request_logs"("status");

-- CreateIndex
CREATE INDEX "vhr_reports_vin_idx" ON "vhr_reports"("vin");

-- CreateIndex
CREATE INDEX "vhr_reports_created_at_idx" ON "vhr_reports"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_vhr_report_id_fkey" FOREIGN KEY ("vhr_report_id") REFERENCES "vhr_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
