-- CreateEnum
CREATE TYPE "SisfeDocumentStatus" AS ENUM ('PENDING', 'AVAILABLE');

-- AlterTable
ALTER TABLE "SisfeDocument"
ADD COLUMN "status" "SisfeDocumentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastError" TEXT,
ALTER COLUMN "byteSize" DROP NOT NULL,
ALTER COLUMN "sha256" DROP NOT NULL,
ALTER COLUMN "content" DROP NOT NULL;

-- Existing rows already contain their binary payload.
UPDATE "SisfeDocument" SET "status" = 'AVAILABLE' WHERE "content" IS NOT NULL;
