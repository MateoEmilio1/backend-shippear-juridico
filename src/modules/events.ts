import type { Request, Response } from "express";
import { z } from "zod";
import { EventStatus, EventType } from "../generated/prisma/client.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types/auth.js";
import { audit } from "../utils/audit.js";
import { HttpError } from "../utils/http.js";

const eventSchema = z.object({
  type: z.enum(EventType).default(EventType.HEARING),
  title: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  startsAt: z.coerce.date(),
  dueAt: z.coerce.date().optional().nullable(),
  status: z.enum(EventStatus).default(EventStatus.PENDING),
  priority: z.coerce.number().int().min(0).max(3).default(0),
  assignedToId: z.uuid().optional().nullable(),
});

const findEvent = async (id: string, workspaceId: string) => {
  const event = await prisma.caseEvent.findFirst({ where: { id, case: { workspaceId } }, include: { case: true } });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  return event;
};

export const listEvents = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const from = request.query.from ? new Date(String(request.query.from)) : new Date(new Date().setHours(0, 0, 0, 0));
  const to = request.query.to ? new Date(String(request.query.to)) : new Date(Date.now() + 45 * 86_400_000);
  const status = Object.values(EventStatus).includes(request.query.status as EventStatus) ? request.query.status as EventStatus : undefined;
  const events = await prisma.caseEvent.findMany({
    where: { case: { workspaceId }, startsAt: { gte: from, lte: to }, ...(status ? { status } : {}) },
    include: { case: { include: { identifiers: { where: { isPrimary: true }, take: 1 } } }, assignedTo: { select: { id: true, email: true, fullName: true } } },
    orderBy: { startsAt: "asc" },
  });
  response.json({ events });
};

export const createEvent = async (request: Request, response: Response) => {
  const auth = (request as AuthenticatedRequest).auth;
  const input = eventSchema.parse(request.body);
  const legalCase = await prisma.legalCase.findFirst({ where: { id: String(request.params.caseId), workspaceId: auth.workspaceId } });
  if (!legalCase) throw new HttpError(404, "Causa no encontrada");
  const event = await prisma.caseEvent.create({ data: { caseId: legalCase.id, createdById: auth.userId, ...input } });
  await audit({ workspaceId: auth.workspaceId, userId: auth.userId, action: "CREATE", entityType: "CaseEvent", entityId: event.id });
  response.status(201).json({ event });
};

export const updateEvent = async (request: Request, response: Response) => {
  const auth = (request as AuthenticatedRequest).auth;
  const input = eventSchema.partial().parse(request.body);
  const existing = await findEvent(String(request.params.id), auth.workspaceId);
  const completed = input.status === EventStatus.COMPLETED && existing.status !== EventStatus.COMPLETED;
  const event = await prisma.caseEvent.update({
    where: { id: existing.id },
    data: {
      ...input,
      ...(completed ? { completedAt: new Date(), completedById: auth.userId } : {}),
      ...(input.status === EventStatus.PENDING ? { completedAt: null, completedById: null } : {}),
    },
  });
  await audit({ workspaceId: auth.workspaceId, userId: auth.userId, action: "UPDATE", entityType: "CaseEvent", entityId: event.id });
  response.json({ event });
};

export const deleteEvent = async (request: Request, response: Response) => {
  const auth = (request as AuthenticatedRequest).auth;
  const existing = await findEvent(String(request.params.id), auth.workspaceId);
  await prisma.caseEvent.delete({ where: { id: existing.id } });
  await audit({ workspaceId: auth.workspaceId, userId: auth.userId, action: "DELETE", entityType: "CaseEvent", entityId: existing.id });
  response.json({ message: "Evento eliminado" });
};
