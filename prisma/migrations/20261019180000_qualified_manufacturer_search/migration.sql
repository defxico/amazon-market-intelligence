ALTER TABLE "products"
ADD COLUMN "manufacturerSearchBrief" VARCHAR(160),
ADD COLUMN "manufacturerSearchRequestId" VARCHAR(100),
ADD COLUMN "manufacturerSearchDiagnostics" JSONB,
ADD COLUMN "manufacturerSearchStatus" VARCHAR(16) NOT NULL DEFAULT 'NONE',
ADD COLUMN "manufacturerSearchAt" TIMESTAMPTZ(3);

ALTER TABLE "manufacturer_candidates"
ADD COLUMN "productBrief" VARCHAR(160),
ADD COLUMN "searchRequestId" VARCHAR(100),
ADD COLUMN "contactUrl" VARCHAR(2048),
ADD COLUMN "capabilityStatus" VARCHAR(32) NOT NULL DEFAULT 'LEGACY';
