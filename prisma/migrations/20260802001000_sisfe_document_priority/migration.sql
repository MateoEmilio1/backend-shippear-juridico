-- AlterTable
ALTER TABLE "SisfeDocument"
ADD COLUMN "prioritized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "prioritizedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SisfeDocument_expedienteId_prioritized_status_idx" ON "SisfeDocument"("expedienteId", "prioritized", "status");
