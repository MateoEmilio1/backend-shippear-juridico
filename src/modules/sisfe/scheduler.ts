import cron from "node-cron";
import { SisfeSyncStatus } from "../../generated/prisma/client.js";
import { config } from "../../config.js";
import { prisma } from "../../prisma.js";
import { notifySisfeSafely } from "./notifier.js";
import { syncSisfeWorkspace } from "./sync.js";

const runningWorkspaces = new Set<string>();

type TriggerOptions = { attempt?: number; source?: "daily" | "manual" | "login" | "retry" };

const notifyResult = async (workspaceId: string, result: Awaited<ReturnType<typeof syncSisfeWorkspace>>) => {
  if (result.status === SisfeSyncStatus.NEEDS_LOGIN) {
    await notifySisfeSafely({
      event: "LOGIN_REQUIRED", workspaceId,
      title: "SISFE requiere iniciar sesión",
      message: "La sesión venció. Abrí el conector local y completá el CAPTCHA para continuar.",
    });
  } else if (result.status === SisfeSyncStatus.FAILED) {
    await notifySisfeSafely({
      event: "SYNC_FAILED", workspaceId,
      title: "Falló la sincronización SISFE",
      message: result.errorMessage || "SISFE no pudo sincronizarse.",
      details: { encontrados: result.foundCount, sincronizados: result.syncedCount, errores: result.errorCount },
    });
  } else if (result.status === SisfeSyncStatus.PARTIAL) {
    await notifySisfeSafely({
      event: "SYNC_PARTIAL", workspaceId,
      title: "SISFE se sincronizó con avisos",
      message: `${result.syncedCount} de ${result.foundCount} expedientes actualizados.`,
      details: { cambios: result.changedCount, novedades: result.movementCount, errores: result.errorCount },
    });
  } else {
    await notifySisfeSafely({
      event: "SYNC_SUCCESS", workspaceId,
      title: "SISFE actualizado",
      message: `${result.syncedCount} expedientes revisados correctamente.`,
      details: { cambios: result.changedCount, novedades: result.movementCount },
    });
  }
};

export const triggerSisfeSync = (workspaceId: string, options: TriggerOptions = {}): boolean => {
  if (runningWorkspaces.has(workspaceId)) return false;
  const attempt = options.attempt ?? 0;
  runningWorkspaces.add(workspaceId);
  void syncSisfeWorkspace(workspaceId)
    .then(async (result) => {
      await notifyResult(workspaceId, result);
      if (result.status === SisfeSyncStatus.FAILED && attempt < config.sisfeRetryAttempts) {
        const delay = config.sisfeRetryDelayMinutes * 60_000;
        console.warn(`[sisfe] reintento ${attempt + 1}/${config.sisfeRetryAttempts} programado en ${config.sisfeRetryDelayMinutes} minutos`);
        setTimeout(() => triggerSisfeSync(workspaceId, { attempt: attempt + 1, source: "retry" }), delay);
      }
    })
    .catch(async (error) => {
      console.error(`[sisfe] falló la sincronización de ${workspaceId}`, error);
      await notifySisfeSafely({
        event: "SYNC_FAILED", workspaceId,
        title: "Falló la sincronización SISFE",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    })
    .finally(() => runningWorkspaces.delete(workspaceId));
  return true;
};

const workspaceIds = async (): Promise<string[]> => {
  const [configured, sessions] = await Promise.all([
    prisma.workspace.findUnique({ where: { slug: config.sisfeWorkspaceSlug }, select: { id: true } }),
    prisma.sisfeSession.findMany({ distinct: ["workspaceId"], select: { workspaceId: true } }),
  ]);
  return [...new Set([configured?.id, ...sessions.map(({ workspaceId }) => workspaceId)].filter(Boolean) as string[])];
};

export const runSchedulerCycle = async (): Promise<void> => {
  const ids = await workspaceIds();
  if (!ids.length) {
    console.warn("[sisfe] corrida diaria omitida: no hay workspaces configurados");
    return;
  }
  ids.forEach((workspaceId) => triggerSisfeSync(workspaceId, { source: "daily" }));
};

export const runLoginReminder = async (): Promise<void> => {
  const ids = await workspaceIds();
  const now = new Date();
  await Promise.all(ids.map(async (workspaceId) => {
    const session = await prisma.sisfeSession.findFirst({
      where: { workspaceId, invalidatedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" }, select: { id: true },
    });
    if (!session) await notifySisfeSafely({
      event: "LOGIN_REQUIRED", workspaceId,
      title: "SISFE necesita reconexión antes de las 07:00",
      message: "Completá el CAPTCHA en el conector local para que la actualización diaria pueda ejecutarse.",
    });
  }));
};

export const startSisfeScheduler = (): void => {
  if (!config.sisfeSyncEnabled) {
    console.info("[sisfe] sincronización programada deshabilitada");
    return;
  }
  if (!cron.validate(config.sisfeSyncCron) || !cron.validate(config.sisfeReminderCron)) {
    throw new Error("Las expresiones cron de SISFE no son válidas");
  }
  void prisma.sisfeSyncRun.updateMany({
    where: { status: SisfeSyncStatus.RUNNING },
    data: { status: SisfeSyncStatus.FAILED, finishedAt: new Date(), errorMessage: "La ejecución fue interrumpida por un reinicio del servicio" },
  }).catch((error) => console.error("[sisfe] no se pudieron cerrar corridas interrumpidas", error));
  cron.schedule(config.sisfeReminderCron, () => {
    runLoginReminder().catch((error) => console.error("[sisfe] error en el recordatorio", error));
  }, { timezone: "America/Argentina/Buenos_Aires" });
  cron.schedule(config.sisfeSyncCron, () => {
    runSchedulerCycle().catch((error) => console.error("[sisfe] error en la corrida diaria", error));
  }, { timezone: "America/Argentina/Buenos_Aires" });
  console.info(`[sisfe] recordatorio (${config.sisfeReminderCron}) y sincronización (${config.sisfeSyncCron}) programados`);
};
