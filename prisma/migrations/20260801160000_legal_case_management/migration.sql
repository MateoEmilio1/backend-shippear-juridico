-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'LAWYER', 'COLLABORATOR', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('SANTA_FE', 'FEDERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('CLIENT', 'DEFENDANT', 'VICTIM', 'COMPLAINANT', 'WITNESS', 'EXPERT', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PERSON', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('RESPONSIBLE_LAWYER', 'CO_COUNSEL', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "CustodyStatus" AS ENUM ('DETAINED', 'HOUSE_ARREST', 'RELEASED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('HEARING', 'DEADLINE', 'TASK', 'FILING', 'MEETING', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('DRIVE_FOLDER', 'DOCUMENT', 'EXTERNAL_LINK');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'LAWYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalCase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "jurisdiction" "Jurisdiction" NOT NULL DEFAULT 'SANTA_FE',
    "procedureCode" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "currentStageId" TEXT,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseIdentifier" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "ContactType" NOT NULL DEFAULT 'PERSON',
    "firstName" TEXT,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseParty" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseAssignment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OffenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalReference" TEXT NOT NULL,
    "lawNumber" TEXT,
    "article" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Offense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseOffense" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "offenseId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "classification" TEXT,
    "notes" TEXT,

    CONSTRAINT "CaseOffense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProceduralStage" (
    "id" TEXT NOT NULL,
    "jurisdiction" "Jurisdiction" NOT NULL,
    "procedureCode" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProceduralStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStageHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "changedById" TEXT NOT NULL,

    CONSTRAINT "CaseStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JudicialOffice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "jurisdiction" "Jurisdiction" NOT NULL,
    "locality" TEXT,

    CONSTRAINT "JudicialOffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetentionFacility" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "system" TEXT NOT NULL,
    "province" TEXT,
    "locality" TEXT,

    CONSTRAINT "DetentionFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyRecord" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "partyId" TEXT,
    "status" "CustodyStatus" NOT NULL,
    "facilityId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "CustodyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseResource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "Membership"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "LegalCase_workspaceId_status_updatedAt_idx" ON "LegalCase"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "LegalCase_workspaceId_currentStageId_idx" ON "LegalCase"("workspaceId", "currentStageId");

-- CreateIndex
CREATE INDEX "CaseIdentifier_type_number_idx" ON "CaseIdentifier"("type", "number");

-- CreateIndex
CREATE UNIQUE INDEX "CaseIdentifier_caseId_type_number_key" ON "CaseIdentifier"("caseId", "type", "number");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_displayName_idx" ON "Contact"("workspaceId", "displayName");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_documentNumber_idx" ON "Contact"("workspaceId", "documentNumber");

-- CreateIndex
CREATE INDEX "CaseParty_caseId_role_idx" ON "CaseParty"("caseId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CaseParty_caseId_contactId_role_key" ON "CaseParty"("caseId", "contactId", "role");

-- CreateIndex
CREATE INDEX "CaseAssignment_userId_idx" ON "CaseAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAssignment_caseId_userId_role_key" ON "CaseAssignment"("caseId", "userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "OffenseCategory_name_key" ON "OffenseCategory"("name");

-- CreateIndex
CREATE INDEX "Offense_name_idx" ON "Offense"("name");

-- CreateIndex
CREATE INDEX "Offense_legalReference_idx" ON "Offense"("legalReference");

-- CreateIndex
CREATE UNIQUE INDEX "Offense_categoryId_name_legalReference_key" ON "Offense"("categoryId", "name", "legalReference");

-- CreateIndex
CREATE INDEX "CaseOffense_offenseId_idx" ON "CaseOffense"("offenseId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseOffense_caseId_offenseId_key" ON "CaseOffense"("caseId", "offenseId");

-- CreateIndex
CREATE INDEX "ProceduralStage_jurisdiction_sortOrder_idx" ON "ProceduralStage"("jurisdiction", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProceduralStage_jurisdiction_procedureCode_name_key" ON "ProceduralStage"("jurisdiction", "procedureCode", "name");

-- CreateIndex
CREATE INDEX "CaseStageHistory_caseId_startedAt_idx" ON "CaseStageHistory"("caseId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JudicialOffice_workspaceId_name_key" ON "JudicialOffice"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DetentionFacility_workspaceId_name_key" ON "DetentionFacility"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "CustodyRecord_caseId_endedAt_idx" ON "CustodyRecord"("caseId", "endedAt");

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_status_startsAt_idx" ON "CaseEvent"("caseId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "CaseEvent_status_startsAt_idx" ON "CaseEvent"("status", "startsAt");

-- CreateIndex
CREATE INDEX "CaseEvent_assignedToId_status_startsAt_idx" ON "CaseEvent"("assignedToId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "CaseNote_caseId_createdAt_idx" ON "CaseNote"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseResource_caseId_createdAt_idx" ON "CaseResource"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_entityType_entityId_idx" ON "AuditLog"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "ProceduralStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseIdentifier" ADD CONSTRAINT "CaseIdentifier_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseParty" ADD CONSTRAINT "CaseParty_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offense" ADD CONSTRAINT "Offense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "OffenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseOffense" ADD CONSTRAINT "CaseOffense_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseOffense" ADD CONSTRAINT "CaseOffense_offenseId_fkey" FOREIGN KEY ("offenseId") REFERENCES "Offense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ProceduralStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStageHistory" ADD CONSTRAINT "CaseStageHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudicialOffice" ADD CONSTRAINT "JudicialOffice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetentionFacility" ADD CONSTRAINT "DetentionFacility_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyRecord" ADD CONSTRAINT "CustodyRecord_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyRecord" ADD CONSTRAINT "CustodyRecord_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyRecord" ADD CONSTRAINT "CustodyRecord_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "DetentionFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseResource" ADD CONSTRAINT "CaseResource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseResource" ADD CONSTRAINT "CaseResource_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseResource" ADD CONSTRAINT "CaseResource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
