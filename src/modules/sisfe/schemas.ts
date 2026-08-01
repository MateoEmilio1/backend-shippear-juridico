import { z } from "zod";

export const sisfeLoginResponseSchema = z.object({ token: z.string() }).passthrough();

export const sisfeExpedienteResumenSchema = z.object({
  id: z.number(),
  expediente: z.string(),
  expCaratula: z.string(),
  expFechaInicio: z.string(),
  fechaActualizacion: z.string(),
  radicacionActual: z.string(),
  expVisible: z.string(),
  expDigital: z.number(),
  expUbicacion: z.string(),
});

export const sisfeBusquedaResponseSchema = z.object({
  totalElements: z.number().nullable(),
  lista: z.array(sisfeExpedienteResumenSchema),
});

export const sisfeExpedienteDetalleSchema = z.object({
  expCaratula: z.string(),
  cuijSufijo: z.string(),
  numeroExpediente: z.string(),
  radicado: z.string(),
  localidad: z.string(),
  fechaIngresoMEU: z.string(),
  expUbicacion: z.string(),
  ultimaActualizacionDelExpediente: z.string(),
  fechaActualizacionSisfeOnline: z.string(),
  organismoCodigo: z.string(),
  expVisible: z.string(),
  expPrincipal: z.string().nullable(),
  expAcumulado: z.string().nullable(),
  cuijExpPrincipal: z.string().nullable(),
  anio: z.string(),
  expDigital: z.number(),
});

export type SisfeLoginResponse = z.infer<typeof sisfeLoginResponseSchema>;
export type SisfeExpedienteResumen = z.infer<typeof sisfeExpedienteResumenSchema>;
export type SisfeBusquedaResponse = z.infer<typeof sisfeBusquedaResponseSchema>;
export type SisfeExpedienteDetalle = z.infer<typeof sisfeExpedienteDetalleSchema>;
