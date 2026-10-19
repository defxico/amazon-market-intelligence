CREATE TABLE "manufacturer_candidates" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "urlHash" VARCHAR(64) NOT NULL,
    "snippet" VARCHAR(2000) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "rightsProfile" VARCHAR(120) NOT NULL,
    "relationshipVerified" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manufacturer_candidates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "enrichment_evidence"
ADD COLUMN "productId" TEXT,
ADD COLUMN "candidateId" TEXT;

CREATE UNIQUE INDEX "manufacturer_candidates_productId_urlHash_key"
ON "manufacturer_candidates"("productId", "urlHash");

CREATE INDEX "manufacturer_candidates_productId_lastSeenAt_idx"
ON "manufacturer_candidates"("productId", "lastSeenAt");

CREATE INDEX "enrichment_evidence_productId_retrievedAt_idx"
ON "enrichment_evidence"("productId", "retrievedAt");

CREATE INDEX "enrichment_evidence_candidateId_retrievedAt_idx"
ON "enrichment_evidence"("candidateId", "retrievedAt");

ALTER TABLE "manufacturer_candidates"
ADD CONSTRAINT "manufacturer_candidates_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrichment_evidence"
ADD CONSTRAINT "enrichment_evidence_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "enrichment_evidence_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "manufacturer_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
