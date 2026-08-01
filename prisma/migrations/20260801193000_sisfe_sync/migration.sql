-- CreateEnum
CREATE TYPE "SisfeSyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'NEEDS_LOGIN');

-- CreateTable
CREATE TABLE "SisfeSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenCifrado" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastValidatedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SisfeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpedienteTracked" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "legalCaseId" TEXT,
    "sisfeId" BIGINT NOT NULL,
    "cuij" TEXT,
    "numero" TEXT NOT NULL,
    "caratula" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3),
    "fechaActualizacion" TIMESTAMP(3),
    "radicacion" TEXT,
    "ubicacion" TEXT,
    "localidad" TEXT,
    "organismoCodigo" TEXT,
    "visible" TEXT,
    "digital" BOOLEAN NOT NULL DEFAULT false,
    "rawSummary" JSONB NOT NULL,
    "rawDetail" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpedienteTracked_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpedienteSnapshot" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "ubicacion" TEXT NOT NULL,
    "radicacion" TEXT NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpedienteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SisfeMovement" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "sisfeId" TEXT,
    "fecha" TIMESTAMP(3),
    "tipo" TEXT,
    "descripcion" TEXT,
    "rawData" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SisfeMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SisfeSyncRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "SisfeSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "jurisdiction" TEXT NOT NULL DEFAULT 'ROSARIO',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "syncedCount" INTEGER NOT NULL DEFAULT 0,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "movementCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    CONSTRAINT "SisfeSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SisfeSession_workspaceId_expiresAt_idx" ON "SisfeSession"("workspaceId", "expiresAt");
CREATE UNIQUE INDEX "ExpedienteTracked_legalCaseId_key" ON "ExpedienteTracked"("legalCaseId");
CREATE UNIQUE INDEX "ExpedienteTracked_workspaceId_sisfeId_key" ON "ExpedienteTracked"("workspaceId", "sisfeId");
CREATE INDEX "ExpedienteTracked_workspaceId_lastSeenAt_idx" ON "ExpedienteTracked"("workspaceId", "lastSeenAt");
CREATE INDEX "ExpedienteTracked_workspaceId_cuij_idx" ON "ExpedienteTracked"("workspaceId", "cuij");
CREATE INDEX "ExpedienteSnapshot_expedienteId_createdAt_idx" ON "ExpedienteSnapshot"("expedienteId", "createdAt");
CREATE UNIQUE INDEX "SisfeMovement_expedienteId_fingerprint_key" ON "SisfeMovement"("expedienteId", "fingerprint");
CREATE INDEX "SisfeMovement_expedienteId_fecha_idx" ON "SisfeMovement"("expedienteId", "fecha");
CREATE INDEX "SisfeSyncRun_workspaceId_startedAt_idx" ON "SisfeSyncRun"("workspaceId", "startedAt");

-- AddForeignKey
ALTER TABLE "SisfeSession" ADD CONSTRAINT "SisfeSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpedienteTracked" ADD CONSTRAINT "ExpedienteTracked_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpedienteTracked" ADD CONSTRAINT "ExpedienteTracked_legalCaseId_fkey" FOREIGN KEY ("legalCaseId") REFERENCES "LegalCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpedienteSnapshot" ADD CONSTRAINT "ExpedienteSnapshot_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "ExpedienteTracked"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SisfeMovement" ADD CONSTRAINT "SisfeMovement_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "ExpedienteTracked"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SisfeSyncRun" ADD CONSTRAINT "SisfeSyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
