import cron from "node-cron";
import { prisma } from "../../prisma.js";
import { createSisfeClient } from "./client.js";
import { decryptToken } from "./crypto.js";
import { parseSisfeDate } from "./dates.js";

const getActiveToken = async (): Promise<string | null> => {
  const session = await prisma.sisfeSession.findFirst({ orderBy: { createdAt: "desc" } });
  if (!session || session.expiresAt <= new Date()) return null;
  return decryptToken(session.tokenCifrado);
};

export const runSchedulerCycle = async (): Promise<void> => {
  const token = await getActiveToken();
  if (!token) {
    console.warn("[sisfe] no hay sesion vigente, hace falta re-loguear a mano (npm run sisfe:login)");
    return;
  }

  const client = createSisfeClient(token);
  const tracked = await prisma.expedienteTracked.findMany();

  for (const expediente of tracked) {
    try {
      const detalle = await client.obtenerExpediente(Number(expediente.sisfeId));
      const lastSnapshot = await prisma.expedienteSnapshot.findFirst({
        where: { expedienteId: expediente.id },
        orderBy: { createdAt: "desc" },
      });

      const actualizadoEn = parseSisfeDate(detalle.ultimaActualizacionDelExpediente);
      const changed =
        !lastSnapshot ||
        lastSnapshot.actualizadoEn.getTime() !== actualizadoEn.getTime() ||
        lastSnapshot.ubicacion !== detalle.expUbicacion ||
        lastSnapshot.radicacion !== detalle.radicado;

      if (!changed) continue;

      await prisma.expedienteSnapshot.create({
        data: {
          expedienteId: expediente.id,
          ubicacion: detalle.expUbicacion,
          radicacion: detalle.radicado,
          actualizadoEn,
        },
      });
      console.log(`[sisfe] cambio detectado en ${expediente.numero}: ${detalle.expUbicacion}`);
    } catch (error) {
      console.error(`[sisfe] error consultando expediente ${expediente.numero}:`, error);
    }
  }
};

export const startSisfeScheduler = (): void => {
  cron.schedule("*/30 * * * *", () => {
    runSchedulerCycle().catch((error) => console.error("[sisfe] error en el ciclo del scheduler:", error));
  });
};
