-- CreateEnum
CREATE TYPE "SisfeDocumentSource" AS ENUM ('ACTUACION', 'CARGO');

-- CreateTable
CREATE TABLE "SisfeDocument" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "movementId" TEXT,
    "source" "SisfeDocumentSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "fecha" TIMESTAMP(3),
    "observacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SisfeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SisfeDocument_expedienteId_source_externalId_key" ON "SisfeDocument"("expedienteId", "source", "externalId");
CREATE INDEX "SisfeDocument_expedienteId_createdAt_idx" ON "SisfeDocument"("expedienteId", "createdAt");
CREATE INDEX "SisfeDocument_movementId_idx" ON "SisfeDocument"("movementId");

-- AddForeignKey
ALTER TABLE "SisfeDocument" ADD CONSTRAINT "SisfeDocument_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "ExpedienteTracked"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SisfeDocument" ADD CONSTRAINT "SisfeDocument_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "SisfeMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
