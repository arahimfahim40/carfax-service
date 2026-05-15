-- CreateTable
CREATE TABLE "system_config" (
    "key" VARCHAR(64) NOT NULL,
    "value" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);
