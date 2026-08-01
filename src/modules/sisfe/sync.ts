import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import { SisfeSyncStatus } from "../../generated/prisma/client.js";
import { prisma } from "../../prisma.js";
import { createSisfeClient, SisfeSessionExpiredError } from "./client.js";
import { decryptToken } from "./crypto.js";
import { parseSisfeDateOrNull } from "./dates.js";
import type { SisfeExpedienteDetalle, SisfeExpedienteResumen, SisfeNovedad } from "./schemas.js";

const jsonValue = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const text = (value: unknown) => typeof value === "string" ? value.trim() : value == null ? "" : String(value);
const firstValue = (item: SisfeNovedad, keys: string[]) => {
  for (const key of keys) if (item[key] != null && text(item[key])) return item[key];
  return null;
};
const movementFingerprint = (item: SisfeNovedad) =>
  createHash("sha256").update(JSON.stringify(item)).digest("hex");

const getActiveSession = async (workspaceId: string) => prisma.sisfeSession.findFirst({
  where: { workspaceId, invalidatedAt: null, expiresAt: { gt: new Date() } },
  orderBy: { createdAt: "desc" },
});

const findOrCreateLegalCase = async (args: {
  workspaceId: string;
  actorId: string | null;
  summary: SisfeExpedienteResumen;
  detail: SisfeExpedienteDetalle;
}) => {
  const cuij = args.detail.cuijSufijo || args.summary.expediente.split("(")[0]?.trim() || null;
  const existing = cuij ? await prisma.legalCase.findFirst({
    where: { workspaceId: args.workspaceId, identifiers: { some: { type: "CUIJ", number: cuij } } },
    select: { id: true },
  }) : null;
  if (existing || !args.actorId) return existing?.id ?? null;

  const created = await prisma.legalCase.create({
    data: {
      workspaceId: args.workspaceId,
      title: args.detail.expCaratula || args.summary.expCaratula || args.summary.expediente,
      jurisdiction: "SANTA_FE",
      procedureCode: "CPPSF",
      openedAt: parseSisfeDateOrNull(args.detail.fechaIngresoMEU || args.summary.expFechaInicio),
      createdById: args.actorId,
      updatedById: args.actorId,
      ...(cuij ? { identifiers: { create: { type: "CUIJ", number: cuij, isPrimary: true } } } : {}),
    },
    select: { id: true },
  });
  return created.id;
};

export const syncOne = async (args: {
  workspaceId: string;
  actorId: string | null;
  summary: SisfeExpedienteResumen;
  detail: SisfeExpedienteDetalle;
  movements: SisfeNovedad[];
  syncedAt: Date;
}) => {
  const { workspaceId, actorId, summary, detail, movements, syncedAt } = args;
  const existing = await prisma.expedienteTracked.findUnique({
    where: { workspaceId_sisfeId: { workspaceId, sisfeId: BigInt(summary.id) } },
    include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const actualizadoEn = parseSisfeDateOrNull(detail.ultimaActualizacionDelExpediente || summary.fechaActualizacion) ?? syncedAt;
  const ubicacion = detail.expUbicacion || summary.expUbicacion || "Sin ubicación informada";
  const radicacion = detail.radicado || summary.radicacionActual || "Sin radicación informada";
  const lastSnapshot = existing?.snapshots[0];
  const changed = !lastSnapshot || lastSnapshot.actualizadoEn.getTime() !== actualizadoEn.getTime()
    || lastSnapshot.ubicacion !== ubicacion || lastSnapshot.radicacion !== radicacion;
  const legalCaseId = existing?.legalCaseId ?? await findOrCreateLegalCase({ workspaceId, actorId, summary, detail });
  const cuij = detail.cuijSufijo || summary.expediente.split("(")[0]?.trim() || null;

  const expediente = await prisma.expedienteTracked.upsert({
    where: { workspaceId_sisfeId: { workspaceId, sisfeId: BigInt(summary.id) } },
    create: {
      workspaceId,
      legalCaseId,
      sisfeId: BigInt(summary.id),
      cuij,
      numero: detail.numeroExpediente || summary.expediente,
      caratula: detail.expCaratula || summary.expCaratula,
      fechaInicio: parseSisfeDateOrNull(detail.fechaIngresoMEU || summary.expFechaInicio),
      fechaActualizacion: actualizadoEn,
      radicacion,
      ubicacion,
      localidad: detail.localidad || "ROSARIO",
      organismoCodigo: detail.organismoCodigo || null,
      visible: detail.expVisible || summary.expVisible || null,
      digital: Boolean(detail.expDigital || summary.expDigital),
      rawSummary: jsonValue(summary),
      rawDetail: jsonValue(detail),
      lastSeenAt: syncedAt,
      lastSyncedAt: syncedAt,
    },
    update: {
      legalCaseId,
      cuij,
      numero: detail.numeroExpediente || summary.expediente,
      caratula: detail.expCaratula || summary.expCaratula,
      fechaInicio: parseSisfeDateOrNull(detail.fechaIngresoMEU || summary.expFechaInicio),
      fechaActualizacion: actualizadoEn,
      radicacion,
      ubicacion,
      localidad: detail.localidad || "ROSARIO",
      organismoCodigo: detail.organismoCodigo || null,
      visible: detail.expVisible || summary.expVisible || null,
      digital: Boolean(detail.expDigital || summary.expDigital),
      rawSummary: jsonValue(summary),
      rawDetail: jsonValue(detail),
      lastSeenAt: syncedAt,
      lastSyncedAt: syncedAt,
    },
  });

  if (changed) await prisma.expedienteSnapshot.create({
    data: { expedienteId: expediente.id, ubicacion, radicacion, actualizadoEn, rawData: jsonValue(detail) },
  });

  let newMovements = 0;
  for (const movement of movements) {
    const fingerprint = movementFingerprint(movement);
    const result = await prisma.sisfeMovement.upsert({
      where: { expedienteId_fingerprint: { expedienteId: expediente.id, fingerprint } },
      create: {
        expedienteId: expediente.id,
        fingerprint,
        sisfeId: text(firstValue(movement, ["id", "idActuacion", "idActCar"])) || null,
        fecha: parseSisfeDateOrNull(firstValue(movement, ["fecha", "fechaActuacion", "fechaMovimiento"])),
        tipo: text(firstValue(movement, ["tipo", "tipoActuacion", "actuacionTipo"])) || null,
        descripcion: text(firstValue(movement, ["descripcion", "actuacion", "movimiento", "detalle"])) || null,
        rawData: jsonValue(movement),
      },
      update: { lastSeenAt: syncedAt, rawData: jsonValue(movement) },
      select: { firstSeenAt: true },
    });
    if (result.firstSeenAt.getTime() >= syncedAt.getTime() - 1000) newMovements++;
  }
  return { changed, newMovements };
};

export type SisfeImportEntry = {
  summary: SisfeExpedienteResumen;
  detail: SisfeExpedienteDetalle;
  movements: SisfeNovedad[];
};

export const processSisfeEntries = async (workspaceId: string, entries: SisfeImportEntry[]) => {
  const actor = await prisma.membership.findFirst({
    where: { workspaceId, user: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  let syncedCount = 0;
  let changedCount = 0;
  let movementCount = 0;
  let errorCount = 0;
  const queue = [...entries];
  const syncedAt = new Date();

  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) return;
      try {
        const result = await syncOne({
          workspaceId, actorId: actor?.userId ?? null,
          summary: entry.summary, detail: entry.detail, movements: entry.movements, syncedAt,
        });
        syncedCount++;
        if (result.changed) changedCount++;
        movementCount += result.newMovements;
      } catch (error) {
        errorCount++;
        console.error(`[sisfe] no se pudo importar ${entry.summary.expediente}`, error);
      }
    }
  });
  await Promise.all(workers);
  return { syncedCount, changedCount, movementCount, errorCount };
};

export const importSisfeEntries = async (workspaceId: string, entries: SisfeImportEntry[]) => {
  const run = await prisma.sisfeSyncRun.create({ data: { workspaceId, foundCount: entries.length } });
  const { syncedCount, changedCount, movementCount, errorCount } = await processSisfeEntries(workspaceId, entries);
  return prisma.sisfeSyncRun.update({
    where: { id: run.id },
    data: {
      status: errorCount ? SisfeSyncStatus.PARTIAL : SisfeSyncStatus.SUCCESS,
      finishedAt: new Date(), syncedCount, changedCount, movementCount, errorCount,
      errorMessage: errorCount ? `${errorCount} expedientes no pudieron importarse` : null,
    },
  });
};

export const syncSisfeWorkspace = async (workspaceId: string) => {
  const run = await prisma.sisfeSyncRun.create({ data: { workspaceId } });
  const session = await getActiveSession(workspaceId);
  if (!session) {
    return prisma.sisfeSyncRun.update({
      where: { id: run.id },
      data: { status: SisfeSyncStatus.NEEDS_LOGIN, finishedAt: new Date(), errorMessage: "Hace falta iniciar sesión manualmente en SISFE" },
    });
  }

  const actor = await prisma.membership.findFirst({
    where: { workspaceId, user: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  const client = createSisfeClient(decryptToken(session.tokenCifrado));
  let foundCount = 0;
  let syncedCount = 0;
  let changedCount = 0;
  let movementCount = 0;
  let errorCount = 0;

  try {
    const summaries = await client.buscarTodosExpedientes({ size: 100 });
    foundCount = summaries.length;
    const queue = [...summaries];
    const workers = Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const summary = queue.shift();
        if (!summary) return;
        try {
          const [detail, movements] = await Promise.all([
            client.obtenerExpediente(summary.id),
            client.obtenerNovedades(summary.id),
          ]);
          const result = await syncOne({ workspaceId, actorId: actor?.userId ?? null, summary, detail, movements, syncedAt: new Date() });
          syncedCount++;
          if (result.changed) changedCount++;
          movementCount += result.newMovements;
        } catch (error) {
          if (error instanceof SisfeSessionExpiredError) throw error;
          errorCount++;
          console.error(`[sisfe] no se pudo sincronizar ${summary.expediente}`, error);
        }
      }
    });
    await Promise.all(workers);
    await prisma.sisfeSession.update({ where: { id: session.id }, data: { lastValidatedAt: new Date() } });
    return await prisma.sisfeSyncRun.update({
      where: { id: run.id },
      data: {
        status: errorCount ? SisfeSyncStatus.PARTIAL : SisfeSyncStatus.SUCCESS,
        finishedAt: new Date(), foundCount, syncedCount, changedCount, movementCount, errorCount,
      },
    });
  } catch (error) {
    const expired = error instanceof SisfeSessionExpiredError;
    if (expired) await prisma.sisfeSession.update({ where: { id: session.id }, data: { invalidatedAt: new Date() } });
    return prisma.sisfeSyncRun.update({
      where: { id: run.id },
      data: {
        status: expired ? SisfeSyncStatus.NEEDS_LOGIN : SisfeSyncStatus.FAILED,
        finishedAt: new Date(), foundCount, syncedCount, changedCount, movementCount,
        errorCount: errorCount + 1,
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Error desconocido",
      },
    });
  }
};
