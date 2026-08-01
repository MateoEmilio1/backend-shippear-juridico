import type { Request, Response } from "express";
import { z } from "zod";
import {
  CaseStatus, ContactType, CustodyStatus, Jurisdiction, PartyRole, Prisma, ResourceType,
} from "../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types/auth.js";
import { audit } from "../utils/audit.js";
import { HttpError } from "../utils/http.js";

const partySchema = z.object({ displayName: z.string().trim().min(2), documentNumber: z.string().trim().optional() });
const caseSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  identifierType: z.string().trim().min(2).default("CUIJ"),
  identifierNumber: z.string().trim().optional().default(""),
  jurisdiction: z.enum(Jurisdiction).default(Jurisdiction.SANTA_FE),
  procedureCode: z.string().trim().optional().nullable(),
  status: z.enum(CaseStatus).default(CaseStatus.ACTIVE),
  priority: z.coerce.number().int().min(0).max(3).default(0),
  currentStageId: z.uuid().optional().nullable(),
  defendants: z.array(partySchema).default([]),
  offenseIds: z.array(z.uuid()).default([]),
  custodyStatus: z.enum(CustodyStatus).optional().nullable(),
  facilityId: z.uuid().optional().nullable(),
  note: z.string().trim().optional().nullable(),
  driveUrl: z.url().optional().or(z.literal("")).nullable(),
});

const caseInclude = {
  identifiers: { orderBy: { isPrimary: "desc" as const } },
  currentStage: true,
  parties: { include: { contact: true }, orderBy: { createdAt: "asc" as const } },
  offenses: { include: { offense: { include: { category: true } } } },
  custodyRecords: { include: { facility: true }, orderBy: { startedAt: "desc" as const } },
  events: { orderBy: { startsAt: "asc" as const } },
  notes: { include: { createdBy: { select: { id: true, email: true, fullName: true } } }, orderBy: { createdAt: "desc" as const } },
  resources: { orderBy: { createdAt: "desc" as const } },
  assignments: { include: { user: { select: { id: true, email: true, fullName: true } } } },
} as const;

type CasePayload = Prisma.LegalCaseGetPayload<{ include: typeof caseInclude }>;

const urgency = (date?: Date | null) => {
  if (!date) return { level: "NONE", days: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return { level: days < 0 ? "OVERDUE" : days <= 3 ? "URGENT" : days <= 10 ? "UPCOMING" : "NORMAL", days };
};

const summarize = (item: CasePayload) => {
  const nextEvent = item.events.find((event) => event.status === "PENDING") ?? null;
  return {
    ...item,
    primaryIdentifier: item.identifiers.find((identifier) => identifier.isPrimary) ?? item.identifiers[0] ?? null,
    defendants: item.parties.filter((party) => party.role === PartyRole.DEFENDANT).map((party) => party.contact),
    currentCustody: item.custodyRecords.find((record) => !record.endedAt) ?? null,
    nextEvent,
    urgency: urgency(nextEvent?.startsAt),
  };
};

const findCase = async (id: string, workspaceId: string) => {
  const item = await prisma.legalCase.findFirst({ where: { id, workspaceId }, include: caseInclude });
  if (!item) throw new HttpError(404, "Causa no encontrada");
  return item;
};

export const listCases = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const page = Math.max(1, Number(request.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(request.query.pageSize ?? 25)));
  const query = String(request.query.q ?? "").trim().toLocaleLowerCase("es");
  const status = Object.values(CaseStatus).includes(request.query.status as CaseStatus) ? request.query.status as CaseStatus : undefined;
  const jurisdiction = Object.values(Jurisdiction).includes(request.query.jurisdiction as Jurisdiction) ? request.query.jurisdiction as Jurisdiction : undefined;
  const urgencyFilter = String(request.query.urgency ?? "");

  const items = await prisma.legalCase.findMany({
    where: { workspaceId, ...(status ? { status } : { status: { not: CaseStatus.ARCHIVED } }), ...(jurisdiction ? { jurisdiction } : {}) },
    include: caseInclude,
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });
  let summarized = items.map(summarize);
  if (query) summarized = summarized.filter((item) => [
    item.title,
    item.description,
    item.primaryIdentifier ? `${item.primaryIdentifier.type} ${item.primaryIdentifier.number}` : "",
    ...item.defendants.map((contact: { displayName: string }) => contact.displayName),
    ...item.offenses.map((relation: { offense: { name: string; legalReference: string } }) => `${relation.offense.name} ${relation.offense.legalReference}`),
  ].join(" ").toLocaleLowerCase("es").includes(query));
  if (urgencyFilter) summarized = summarized.filter((item) => item.urgency.level === urgencyFilter);

  const total = summarized.length;
  response.json({ items: summarized.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) });
};

export const getCase = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  response.json({ case: summarize(await findCase(String(request.params.id), workspaceId)) });
};

export const createCase = async (request: Request, response: Response) => {
  const auth = (request as AuthenticatedRequest).auth;
  const input = caseSchema.parse(request.body);
  const created = await prisma.$transaction(async (tx) => {
    const legalCase = await tx.legalCase.create({
      data: {
        workspaceId: auth.workspaceId, title: input.title, description: input.description,
        jurisdiction: input.jurisdiction, procedureCode: input.procedureCode, status: input.status,
        priority: input.priority, currentStageId: input.currentStageId, createdById: auth.userId, updatedById: auth.userId,
        identifiers: input.identifierNumber ? { create: { type: input.identifierType, number: input.identifierNumber, isPrimary: true } } : undefined,
        offenses: { create: input.offenseIds.map((offenseId, index) => ({ offenseId, isPrimary: index === 0 })) },
      },
    });
    for (const [index, defendant] of input.defendants.entries()) {
      const contact = await tx.contact.create({ data: { workspaceId: auth.workspaceId, type: ContactType.PERSON, displayName: defendant.displayName, documentNumber: defendant.documentNumber || null } });
      await tx.caseParty.create({ data: { caseId: legalCase.id, contactId: contact.id, role: PartyRole.DEFENDANT, isPrimary: index === 0 } });
    }
    if (input.currentStageId) await tx.caseStageHistory.create({ data: { caseId: legalCase.id, stageId: input.currentStageId, changedById: auth.userId } });
    if (input.custodyStatus) await tx.custodyRecord.create({ data: { caseId: legalCase.id, status: input.custodyStatus, facilityId: input.facilityId } });
    if (input.note) await tx.caseNote.create({ data: { workspaceId: auth.workspaceId, caseId: legalCase.id, content: input.note, isPinned: true, createdById: auth.userId } });
    if (input.driveUrl) await tx.caseResource.create({ data: { workspaceId: auth.workspaceId, caseId: legalCase.id, type: ResourceType.DRIVE_FOLDER, name: "Carpeta de la causa", url: input.driveUrl, createdById: auth.userId } });
    return legalCase;
  });
  await audit({ workspaceId: auth.workspaceId, userId: auth.userId, action: "CREATE", entityType: "LegalCase", entityId: created.id });
  response.status(201).json({ case: summarize(await findCase(created.id, auth.workspaceId)) });
};

export const updateCase = async (request: Request, response: Response) => {
  const auth = (request as AuthenticatedRequest).auth;
  const input = caseSchema.parse(request.body);
  const existing = await findCase(String(request.params.id), auth.workspaceId);
  await prisma.$transaction(async (tx) => {
    await tx.legalCase.update({ where: { id: existing.id }, data: {
      title: input.title, description: input.description, jurisdiction: input.jurisdiction,
      procedureCode: input.procedureCode, status: input.status, priority: input.priority,
      currentStageId: input.currentStageId, updatedById: auth.userId,
    } });
    await tx.caseIdentifier.deleteMany({ where: { caseId: existing.id } });
    if (input.identifierNumber) await tx.caseIdentifier.create({ data: { caseId: existing.id, type: input.identifierType, number: input.identifierNumber, isPrimary: true } });
    await tx.caseOffense.deleteMany({ where: { caseId: existing.id } });
    if (input.offenseIds.length) await tx.caseOffense.createMany({ data: input.offenseIds.map((offenseId, index) => ({ caseId: existing.id, offenseId, isPrimary: index === 0 })) });
    await tx.caseParty.deleteMany({ where: { caseId: existing.id, role: PartyRole.DEFENDANT } });
    for (const [index, defendant] of input.defendants.entries()) {
      const contact = await tx.contact.create({ data: { workspaceId: auth.workspaceId, type: ContactType.PERSON, displayName: defendant.displayName, documentNumber: defendant.documentNumber || null } });
      await tx.caseParty.create({ data: { caseId: existing.id, contactId: contact.id, role: PartyRole.DEFENDANT, isPrimary: index === 0 } });
    }
    if (input.currentStageId && input.currentStageId !== existing.currentStageId) {
      await tx.caseStageHistory.updateMany({ where: { caseId: existing.id, endedAt: null }, data: { endedAt: new Date() } });
      await tx.caseStageHistory.create({ data: { caseId: existing.id, stageId: input.currentStageId, changedById: auth.userId } });
    }
    const currentCustody = existing.custodyRecords.find((record) => !record.endedAt);
    if (input.custodyStatus && (currentCustody?.status !== input.custodyStatus || currentCustody.facilityId !== input.facilityId)) {
      await tx.custodyRecord.updateMany({ where: { caseId: existing.id, endedAt: null }, data: { endedAt: new Date() } });
      await tx.custodyRecord.create({ data: { caseId: existing.id, status: input.custodyStatus, facilityId: input.facilityId } });
    } else if (!input.custodyStatus && currentCustody) {
      await tx.custodyRecord.updateMany({ where: { caseId: existing.id, endedAt: null }, data: { endedAt: new Date() } });
    }
  });
  await audit({ workspaceId: auth.workspaceId, userId: auth.userId, action: "UPDATE", entityType: "LegalCase", entityId: existing.id });
  response.json({ case: summarize(await findCase(existing.id, auth.workspaceId)) });
};

export const archiveCase = async (request: Request, response: Response) => {
  const auth = (request as AuthenticatedRequest).auth;
  const existing = await findCase(String(request.params.id), auth.workspaceId);
  await prisma.legalCase.update({ where: { id: existing.id }, data: { status: CaseStatus.ARCHIVED, archivedAt: new Date(), updatedById: auth.userId } });
  await audit({ workspaceId: auth.workspaceId, userId: auth.userId, action: "ARCHIVE", entityType: "LegalCase", entityId: existing.id });
  response.json({ message: "Causa archivada" });
};

const noteSchema = z.object({ content: z.string().trim().min(1), isPinned: z.boolean().default(false) });
export const createNote = async (request: Request, response: Response) => {
  const auth = (request as AuthenticatedRequest).auth;
  const input = noteSchema.parse(request.body);
  const legalCase = await findCase(String(request.params.id), auth.workspaceId);
  const note = await prisma.caseNote.create({ data: { workspaceId: auth.workspaceId, caseId: legalCase.id, createdById: auth.userId, ...input } });
  await audit({ workspaceId: auth.workspaceId, userId: auth.userId, action: "CREATE", entityType: "CaseNote", entityId: note.id });
  response.status(201).json({ note });
};

const resourceSchema = z.object({ name: z.string().trim().min(1), url: z.url(), type: z.enum(ResourceType).default(ResourceType.EXTERNAL_LINK) });
export const createResource = async (request: Request, response: Response) => {
  const auth = (request as AuthenticatedRequest).auth;
  const input = resourceSchema.parse(request.body);
  const legalCase = await findCase(String(request.params.id), auth.workspaceId);
  const resource = await prisma.caseResource.create({ data: { workspaceId: auth.workspaceId, caseId: legalCase.id, createdById: auth.userId, ...input } });
  await audit({ workspaceId: auth.workspaceId, userId: auth.userId, action: "CREATE", entityType: "CaseResource", entityId: resource.id });
  response.status(201).json({ resource });
};
