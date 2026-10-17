-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DISPATCH_FAILED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DISPATCHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProviderUsageStatus" AS ENUM ('RESERVED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "research_jobs" (
    "id" TEXT NOT NULL,
    "keyword" VARCHAR(120) NOT NULL,
    "marketplace" VARCHAR(32) NOT NULL DEFAULT 'amazon.com',
    "page" INTEGER NOT NULL DEFAULT 1,
    "requestedLimit" INTEGER NOT NULL DEFAULT 10,
    "source" VARCHAR(24) NOT NULL DEFAULT 'fixture',
    "sourceRightsProfile" VARCHAR(120),
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" VARCHAR(100),
    "workflowRunId" VARCHAR(128),
    "errorMessage" VARCHAR(240),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "research_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "marketplace" VARCHAR(32) NOT NULL,
    "asin" VARCHAR(10) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "brand" VARCHAR(200),
    "detailUrl" VARCHAR(300) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_observations" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER,
    "price" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "provider" VARCHAR(24) NOT NULL,
    "evidenceUrl" VARCHAR(500) NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_outbox" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMPTZ(3),
    "claimToken" VARCHAR(64),
    "lastError" VARCHAR(240),
    "dispatchedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflow_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "requestId" VARCHAR(100) NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "status" "ProviderUsageStatus" NOT NULL DEFAULT 'RESERVED',
    "errorCode" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrichment_evidence" (
    "id" TEXT NOT NULL,
    "sourceHost" VARCHAR(253) NOT NULL,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excerpt" VARCHAR(4000) NOT NULL,
    "rightsProfile" VARCHAR(120) NOT NULL,
    "parserVersion" VARCHAR(80) NOT NULL DEFAULT 'firecrawl-markdown-v1',

    CONSTRAINT "enrichment_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "research_jobs_idempotencyKey_key" ON "research_jobs"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "research_jobs_workflowRunId_key" ON "research_jobs"("workflowRunId");

-- CreateIndex
CREATE INDEX "research_jobs_keyword_marketplace_page_requestedLimit_statu_idx" ON "research_jobs"("keyword", "marketplace", "page", "requestedLimit", "status", "completedAt");

-- CreateIndex
CREATE INDEX "research_jobs_status_createdAt_idx" ON "research_jobs"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "products_marketplace_asin_key" ON "products"("marketplace", "asin");

-- CreateIndex
CREATE INDEX "product_observations_productId_observedAt_idx" ON "product_observations"("productId", "observedAt");

-- CreateIndex
CREATE INDEX "product_observations_observedAt_idx" ON "product_observations"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_observations_jobId_productId_key" ON "product_observations"("jobId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_outbox_jobId_key" ON "workflow_outbox"("jobId");

-- CreateIndex
CREATE INDEX "workflow_outbox_status_nextAttemptAt_idx" ON "workflow_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "workflow_outbox_status_leaseUntil_idx" ON "workflow_outbox"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "provider_usage_requestId_key" ON "provider_usage"("requestId");

-- CreateIndex
CREATE INDEX "provider_usage_provider_createdAt_idx" ON "provider_usage"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "provider_usage_status_createdAt_idx" ON "provider_usage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "enrichment_evidence_sourceHost_retrievedAt_idx" ON "enrichment_evidence"("sourceHost", "retrievedAt");

-- CreateIndex
CREATE INDEX "enrichment_evidence_retrievedAt_idx" ON "enrichment_evidence"("retrievedAt");

-- AddForeignKey
ALTER TABLE "product_observations" ADD CONSTRAINT "product_observations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "research_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_observations" ADD CONSTRAINT "product_observations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_outbox" ADD CONSTRAINT "workflow_outbox_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "research_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "research_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
