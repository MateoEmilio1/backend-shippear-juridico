import { createHash, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { prisma } from "../../prisma.js";
import type { AuthenticatedRequest } from "../../types/auth.js";
import { HttpError } from "../../utils/http.js";
import { encryptToken } from "./crypto.js";
import { sisfeExpedienteDetalleSchema, sisfeExpedienteResumenSchema, sisfeNovedadesResponseSchema } from "./schemas.js";
import { triggerSisfeSync } from "./scheduler.js";
import { importSisfeEntries, processSisfeEntries } from "./sync.js";

const connectionSchema = z.object({
  token: z.string().min(40),
  workspaceSlug: z.string().min(1).optional(),
  syncMode: z.enum(["backend", "local"]).default("backend"),
});
const entriesSchema = z.array(z.object({
    summary: sisfeExpedienteResumenSchema,
    detail: sisfeExpedienteDetalleSchema,
    movements: sisfeNovedadesResponseSchema.shape.lista,
  })).min(1).max(500);
const importSchema = z.object({
  workspaceSlug: z.string().min(1).optional(),
  entries: entriesSchema,
});
const browserImportSchema = importSchema.extend({ token: z.string().min(40), ticket: z.string().min(40) });
const browserImportStartSchema = z.object({
  ticket: z.string().min(40), token: z.string().min(40), totalExpected: z.number().int().min(1).max(500),
});
const browserImportBatchSchema = z.object({
  ticket: z.string().min(40), importId: z.string().uuid(), entries: entriesSchema.max(10), isFinal: z.boolean().default(false),
});
const browserDocumentHeadersSchema = z.object({
  ticket: z.string().min(40),
  importId: z.string().uuid(),
  expedienteSisfeId: z.string().min(1),
  source: z.enum(["ACTUACION", "CARGO"]),
  externalId: z.string().min(1),
  movementExternalId: z.string().optional(),
  fileName: z.string().min(1).max(500),
  fecha: z.string().optional(),
  observacion: z.string().max(4000).optional(),
});

const secureEquals = (received: string, expected: string) => {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

const verifyConnectTicket = (ticket: string) => {
  try {
    const payload = jwt.verify(ticket, config.jwtSecret) as { type?: string; workspaceId?: string };
    if (payload.type !== "sisfe-connect" || !payload.workspaceId) throw new Error("invalid");
    return { workspaceId: payload.workspaceId };
  } catch {
    throw new HttpError(401, "El enlace de conexión SISFE venció");
  }
};

const sisfeTokenExpiration = (token: string) => {
  const payload = jwt.decode(token) as { exp?: number } | null;
  if (!payload?.exp || payload.exp * 1000 <= Date.now()) throw new HttpError(400, "La sesión SISFE venció");
  return new Date(payload.exp * 1000);
};

export const receiveSisfeSession = async (request: Request, response: Response) => {
  const secret = request.header("x-sisfe-connect-secret") ?? "";
  if (!config.sisfeConnectSecret || !secureEquals(secret, config.sisfeConnectSecret)) {
    throw new HttpError(401, "Conexión SISFE no autorizada");
  }
  const { token, workspaceSlug = config.sisfeWorkspaceSlug, syncMode } = connectionSchema.parse(request.body);
  const payload = jwt.decode(token) as { exp?: number } | null;
  if (!payload?.exp) throw new HttpError(400, "El token SISFE no tiene expiración");
  const expiresAt = new Date(payload.exp * 1000);
  if (expiresAt <= new Date()) throw new HttpError(400, "El token SISFE ya venció");
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug }, select: { id: true } });
  if (!workspace) throw new HttpError(404, "Workspace no encontrado");

  await prisma.$transaction([
    prisma.sisfeSession.updateMany({ where: { workspaceId: workspace.id, invalidatedAt: null }, data: { invalidatedAt: new Date() } }),
    prisma.sisfeSession.create({
      data: { workspaceId: workspace.id, tokenCifrado: encryptToken(token), expiresAt, lastValidatedAt: new Date() },
    }),
  ]);
  const queued = syncMode === "backend" ? triggerSisfeSync(workspace.id, { source: "login" }) : false;
  response.status(202).json({ connected: true, expiresAt: expiresAt.toISOString(), syncQueued: queued });
};

export const importSisfeSnapshot = async (request: Request, response: Response) => {
  const secret = request.header("x-sisfe-connect-secret") ?? "";
  if (!config.sisfeConnectSecret || !secureEquals(secret, config.sisfeConnectSecret)) {
    throw new HttpError(401, "Importación SISFE no autorizada");
  }
  const { workspaceSlug = config.sisfeWorkspaceSlug, entries } = importSchema.parse(request.body);
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug }, select: { id: true } });
  if (!workspace) throw new HttpError(404, "Workspace no encontrado");
  const result = await importSisfeEntries(workspace.id, entries);
  response.json({
    runId: result.id,
    status: result.status,
    foundCount: result.foundCount,
    syncedCount: result.syncedCount,
    changedCount: result.changedCount,
    movementCount: result.movementCount,
    errorCount: result.errorCount,
  });
};

export const createSisfeConnectTicket = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const expiresInSeconds = 2 * 60 * 60;
  const ticket = jwt.sign({ type: "sisfe-connect", workspaceId }, config.jwtSecret, { expiresIn: expiresInSeconds });
  const loginUrl = `https://sisfe.justiciasantafe.gov.ar/login-matriculado#roxium_ticket=${encodeURIComponent(ticket)}`;
  response.json({ ticket, loginUrl, expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString() });
};

const decodedHeader = (request: Request, name: string) => {
  const value = request.header(name);
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { throw new HttpError(400, `Cabecera ${name} inválida`); }
};

export const importSisfeBrowserDocument = async (request: Request, response: Response) => {
  const headers = browserDocumentHeadersSchema.parse({
    ticket: request.header("x-sisfe-ticket"),
    importId: request.header("x-import-id"),
    expedienteSisfeId: request.header("x-expediente-sisfe-id"),
    source: request.header("x-document-source"),
    externalId: request.header("x-document-external-id"),
    movementExternalId: request.header("x-movement-external-id") || undefined,
    fileName: decodedHeader(request, "x-file-name"),
    fecha: request.header("x-document-date") || undefined,
    observacion: decodedHeader(request, "x-observation"),
  });
  const { workspaceId } = verifyConnectTicket(headers.ticket);
  const run = await prisma.sisfeSyncRun.findFirst({ where: { id: headers.importId, workspaceId }, select: { id: true } });
  if (!run) throw new HttpError(404, "Importación SISFE no encontrada");
  if (!Buffer.isBuffer(request.body) || !request.body.length) throw new HttpError(400, "El documento está vacío");

  let sisfeId: bigint;
  try { sisfeId = BigInt(headers.expedienteSisfeId); } catch { throw new HttpError(400, "Identificador de expediente inválido"); }
  const expediente = await prisma.expedienteTracked.findUnique({
    where: { workspaceId_sisfeId: { workspaceId, sisfeId } }, select: { id: true },
  });
  if (!expediente) throw new HttpError(404, "El expediente todavía no fue importado");
  const movement = headers.movementExternalId ? await prisma.sisfeMovement.findFirst({
    where: { expedienteId: expediente.id, sisfeId: headers.movementExternalId }, select: { id: true },
  }) : null;
  const fecha = headers.fecha ? new Date(headers.fecha) : null;
  const safeDate = fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;
  const rawBody = request.body as Buffer;
  const content = Uint8Array.from(rawBody);
  const mimeType = ((request.header("content-type") || "application/pdf").split(";")[0] ?? "application/pdf").slice(0, 200);
  const sha256 = createHash("sha256").update(rawBody).digest("hex");
  const document = await prisma.sisfeDocument.upsert({
    where: { expedienteId_source_externalId: { expedienteId: expediente.id, source: headers.source, externalId: headers.externalId } },
    create: {
      expedienteId: expediente.id, movementId: movement?.id, source: headers.source, externalId: headers.externalId,
      fileName: headers.fileName, mimeType, byteSize: rawBody.length, sha256, content,
      fecha: safeDate, observacion: headers.observacion || null,
    },
    update: {
      movementId: movement?.id, fileName: headers.fileName, mimeType, byteSize: rawBody.length,
      sha256, content, fecha: safeDate, observacion: headers.observacion || null,
    },
    select: { id: true, fileName: true, byteSize: true, sha256: true },
  });
  response.json({ document });
};

export const importSisfeBrowserSnapshot = async (request: Request, response: Response) => {
  const { ticket, token, entries } = browserImportSchema.parse(request.body);
  const { workspaceId } = verifyConnectTicket(ticket);
  const expiresAt = sisfeTokenExpiration(token);

  await prisma.$transaction([
    prisma.sisfeSession.updateMany({ where: { workspaceId, invalidatedAt: null }, data: { invalidatedAt: new Date() } }),
    prisma.sisfeSession.create({
      data: { workspaceId, tokenCifrado: encryptToken(token), expiresAt, lastValidatedAt: new Date() },
    }),
  ]);
  const result = await importSisfeEntries(workspaceId, entries);
  response.json({
    status: result.status, foundCount: result.foundCount, syncedCount: result.syncedCount,
    changedCount: result.changedCount, movementCount: result.movementCount, errorCount: result.errorCount,
  });
};

export const startSisfeBrowserImport = async (request: Request, response: Response) => {
  const { ticket, token, totalExpected } = browserImportStartSchema.parse(request.body);
  const { workspaceId } = verifyConnectTicket(ticket);
  const expiresAt = sisfeTokenExpiration(token);
  const [, , run] = await prisma.$transaction([
    prisma.sisfeSession.updateMany({ where: { workspaceId, invalidatedAt: null }, data: { invalidatedAt: new Date() } }),
    prisma.sisfeSession.create({ data: { workspaceId, tokenCifrado: encryptToken(token), expiresAt, lastValidatedAt: new Date() } }),
    prisma.sisfeSyncRun.create({ data: { workspaceId, foundCount: totalExpected } }),
  ]);
  response.json({ importId: run.id, totalExpected });
};

export const importSisfeBrowserBatch = async (request: Request, response: Response) => {
  const { ticket, importId, entries, isFinal } = browserImportBatchSchema.parse(request.body);
  const { workspaceId } = verifyConnectTicket(ticket);
  const run = await prisma.sisfeSyncRun.findFirst({ where: { id: importId, workspaceId, status: "RUNNING" } });
  if (!run) throw new HttpError(404, "La importación ya no está activa");
  const metrics = await processSisfeEntries(workspaceId, entries);
  let updated = await prisma.sisfeSyncRun.update({
    where: { id: importId },
    data: {
      syncedCount: { increment: metrics.syncedCount }, changedCount: { increment: metrics.changedCount },
      movementCount: { increment: metrics.movementCount }, errorCount: { increment: metrics.errorCount },
    },
  });
  if (isFinal) updated = await prisma.sisfeSyncRun.update({
    where: { id: importId },
    data: {
      status: updated.errorCount ? "PARTIAL" : "SUCCESS", finishedAt: new Date(),
      errorMessage: updated.errorCount ? `${updated.errorCount} expedientes no pudieron importarse` : null,
    },
  });
  response.json({
    status: updated.status, foundCount: updated.foundCount, syncedCount: updated.syncedCount,
    changedCount: updated.changedCount, movementCount: updated.movementCount, errorCount: updated.errorCount,
  });
};

export const getSisfeStatus = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const now = new Date();
  const [session, lastRun, total] = await Promise.all([
    prisma.sisfeSession.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    prisma.sisfeSyncRun.findFirst({ where: { workspaceId }, orderBy: { startedAt: "desc" } }),
    prisma.expedienteTracked.count({ where: { workspaceId } }),
  ]);
  response.json({
    connected: Boolean(session && !session.invalidatedAt && session.expiresAt > now),
    expiresAt: session?.expiresAt ?? null,
    lastValidatedAt: session?.lastValidatedAt ?? null,
    total,
    lastRun,
  });
};

export const triggerSisfeSyncNow = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const queued = triggerSisfeSync(workspaceId);
  response.status(queued ? 202 : 409).json({ queued });
};

export const listSisfeExpedientes = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const query = z.object({ q: z.string().trim().optional(), page: z.coerce.number().int().min(1).default(1) }).parse(request.query);
  const pageSize = 25;
  const where = {
    workspaceId,
    ...(query.q ? { OR: [
      { caratula: { contains: query.q, mode: "insensitive" as const } },
      { cuij: { contains: query.q, mode: "insensitive" as const } },
      { numero: { contains: query.q, mode: "insensitive" as const } },
      { radicacion: { contains: query.q, mode: "insensitive" as const } },
    ] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.expedienteTracked.findMany({
      where,
      orderBy: [{ fechaActualizacion: "desc" }, { caratula: "asc" }],
      skip: (query.page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { movements: true, snapshots: true, documents: true } } },
    }),
    prisma.expedienteTracked.count({ where }),
  ]);
  response.json({
    items: items.map((item) => ({ ...item, sisfeId: item.sisfeId.toString() })),
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  });
};

export const getSisfeExpediente = async (request: Request, response: Response) => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const item = await prisma.expedienteTracked.findFirst({
    where: { id: String(request.params.id), workspaceId },
    include: {
      movements: { orderBy: [{ fecha: "desc" }, { firstSeenAt: "desc" }] },
      snapshots: { orderBy: { createdAt: "desc" } },
      legalCase: { select: { id: true, title: true } },
      documents: {
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        select: { id: true, movementId: true, source: true, externalId: true, fileName: true, mimeType: true, byteSize: true, sha256: true, fecha: true, observacion: true, createdAt: true, updatedAt: true },
      },
    },
  });
  if (!item) throw new HttpError(404, "Expediente SISFE no encontrado");
  response.json({ item: { ...item, sisfeId: item.sisfeId.toString() } });
};

const contentDisposition = (fileName: string, disposition: "attachment" | "inline") => {
  const fallback = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "documento.pdf";
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

const sendSisfeDocument = async (request: Request, response: Response, disposition: "attachment" | "inline") => {
  const { workspaceId } = (request as AuthenticatedRequest).auth;
  const document = await prisma.sisfeDocument.findFirst({
    where: { id: String(request.params.id), expediente: { workspaceId } },
    select: { fileName: true, mimeType: true, byteSize: true, content: true },
  });
  if (!document) throw new HttpError(404, "Documento no encontrado");
  const content = Buffer.from(document.content);
  const range = request.header("range")?.match(/^bytes=(\d*)-(\d*)$/);
  response.setHeader("Content-Type", document.mimeType);
  response.setHeader("Content-Disposition", contentDisposition(document.fileName, disposition));
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Accept-Ranges", "bytes");
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const requestedEnd = range[2] ? Number(range[2]) : content.length - 1;
    const end = Math.min(requestedEnd, content.length - 1);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= content.length) {
      response.status(416).setHeader("Content-Range", `bytes */${content.length}`);
      return void response.end();
    }
    const chunk = content.subarray(start, end + 1);
    response.status(206);
    response.setHeader("Content-Range", `bytes ${start}-${end}/${content.length}`);
    response.setHeader("Content-Length", String(chunk.length));
    return void response.send(chunk);
  }
  response.setHeader("Content-Length", String(content.length));
  response.send(content);
};

export const downloadSisfeDocument = (request: Request, response: Response) => sendSisfeDocument(request, response, "attachment");
export const viewSisfeDocument = (request: Request, response: Response) => sendSisfeDocument(request, response, "inline");
