import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { CaseStatus, type Prisma } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { prisma } from "../prisma.js";
import { HttpError } from "../utils/http.js";

const secureEquals = (received: string, expected: string) => {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const requireAgentApiKey = (request: Request, _response: Response, next: NextFunction) => {
  if (!config.agentApiEnabled) return next(new HttpError(404, "Endpoint no habilitado"));
  const bearer = request.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const received = bearer || request.header("x-agent-api-key") || "";
  if (!config.agentApiKey || !secureEquals(received, config.agentApiKey)) {
    return next(new HttpError(401, "API key de agente inválida"));
  }
  next();
};

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
  updatedSince: z.iso.datetime({ offset: true }).optional(),
  includeArchived: z.string().optional().transform((value) => value === "true"),
});

const agentInclude = {
  identifiers: { orderBy: { isPrimary: "desc" as const } },
  currentStage: true,
  stageHistory: { include: { stage: true }, orderBy: { startedAt: "asc" as const } },
  parties: { include: { contact: true }, orderBy: { createdAt: "asc" as const } },
  offenses: { include: { offense: { include: { category: true } } } },
  assignments: { include: { user: { select: { id: true, email: true, fullName: true } } } },
  custodyRecords: { include: { facility: true }, orderBy: { startedAt: "desc" as const } },
  events: { orderBy: { startsAt: "asc" as const } },
  notes: { include: { createdBy: { select: { id: true, email: true, fullName: true } } }, orderBy: { createdAt: "desc" as const } },
  resources: { orderBy: { createdAt: "desc" as const } },
  sisfeExpediente: {
    include: {
      snapshots: { orderBy: { createdAt: "desc" as const } },
      movements: { orderBy: { fecha: "desc" as const } },
      documents: {
        orderBy: { fecha: "desc" as const },
        select: { id: true, movementId: true, source: true, externalId: true, fileName: true, mimeType: true, byteSize: true, sha256: true, fecha: true, observacion: true, createdAt: true, updatedAt: true },
      },
    },
  },
} as const;

type AgentCasePayload = Prisma.LegalCaseGetPayload<{ include: typeof agentInclude }>;

const serializeCase = (item: AgentCasePayload) => ({
  ...item,
  sisfeExpediente: item.sisfeExpediente
    ? {
      ...item.sisfeExpediente,
      sisfeId: item.sisfeExpediente.sisfeId.toString(),
      documents: item.sisfeExpediente.documents.map((document) => ({ ...document, downloadUrl: `/api/agent/documents/${document.id}/download` })),
    }
    : null,
});

const workspace = async () => {
  const item = await prisma.workspace.findUnique({
    where: { slug: config.agentWorkspaceSlug },
    select: { id: true, name: true, slug: true, timezone: true },
  });
  if (!item) throw new HttpError(404, "Workspace del agente no encontrado");
  return item;
};

export const listAgentCases = async (request: Request, response: Response) => {
  const query = querySchema.parse(request.query);
  const target = await workspace();
  const where = {
    workspaceId: target.id,
    ...(!query.includeArchived ? { status: { not: CaseStatus.ARCHIVED } } : {}),
    ...(query.updatedSince ? { updatedAt: { gte: new Date(query.updatedSince) } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.legalCase.findMany({
      where, include: agentInclude, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    }),
    prisma.legalCase.count({ where }),
  ]);
  response.json({
    apiVersion: "2026-08-01", generatedAt: new Date().toISOString(), workspace: target,
    pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.max(1, Math.ceil(total / query.pageSize)) },
    cases: items.map(serializeCase),
  });
};

export const getAgentCase = async (request: Request, response: Response) => {
  const target = await workspace();
  const item = await prisma.legalCase.findFirst({
    where: { id: String(request.params.id), workspaceId: target.id }, include: agentInclude,
  });
  if (!item) throw new HttpError(404, "Causa no encontrada");
  response.json({ apiVersion: "2026-08-01", generatedAt: new Date().toISOString(), case: serializeCase(item) });
};

export const downloadAgentDocument = async (request: Request, response: Response) => {
  const target = await workspace();
  const document = await prisma.sisfeDocument.findFirst({
    where: { id: String(request.params.id), expediente: { workspaceId: target.id } },
    select: { fileName: true, mimeType: true, byteSize: true, content: true },
  });
  if (!document) throw new HttpError(404, "Documento no encontrado");
  const fallback = document.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "documento.pdf";
  response.setHeader("Content-Type", document.mimeType);
  response.setHeader("Content-Length", String(document.byteSize));
  response.setHeader("Content-Disposition", `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(document.fileName)}`);
  response.setHeader("Cache-Control", "private, no-store");
  response.send(Buffer.from(document.content));
};
