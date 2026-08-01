import { z } from "zod";

export const sisfeLoginResponseSchema = z.object({ token: z.string() }).passthrough();

const optionalText = z.string().nullish().transform((value) => value ?? "");

export const sisfeExpedienteResumenSchema = z.object({
  id: z.coerce.number(),
  expediente: optionalText,
  expCaratula: optionalText,
  expFechaInicio: optionalText,
  fechaActualizacion: optionalText,
  radicacionActual: optionalText,
  expVisible: optionalText,
  expDigital: z.coerce.number().nullish().transform((value) => value ?? 0),
  expUbicacion: optionalText,
}).passthrough();

export const sisfeBusquedaResponseSchema = z.object({
  totalElements: z.coerce.number().nullable().optional().default(null),
  lista: z.array(sisfeExpedienteResumenSchema),
}).passthrough();

export const sisfeExpedienteDetalleSchema = z.object({
  expCaratula: optionalText,
  cuijSufijo: optionalText,
  numeroExpediente: optionalText,
  radicado: optionalText,
  localidad: optionalText,
  fechaIngresoMEU: optionalText,
  expUbicacion: optionalText,
  ultimaActualizacionDelExpediente: optionalText,
  fechaActualizacionSisfeOnline: optionalText,
  organismoCodigo: optionalText,
  expVisible: optionalText,
  expPrincipal: z.string().nullable().optional().default(null),
  expAcumulado: z.string().nullable().optional().default(null),
  cuijExpPrincipal: z.string().nullable().optional().default(null),
  anio: optionalText,
  expDigital: z.coerce.number().nullish().transform((value) => value ?? 0),
}).passthrough();

export const sisfeNovedadesResponseSchema = z.object({
  totalElements: z.coerce.number().nullable().optional().default(null),
  lista: z.array(z.record(z.string(), z.unknown())),
}).passthrough();

export type SisfeLoginResponse = z.infer<typeof sisfeLoginResponseSchema>;
export type SisfeExpedienteResumen = z.infer<typeof sisfeExpedienteResumenSchema>;
export type SisfeBusquedaResponse = z.infer<typeof sisfeBusquedaResponseSchema>;
export type SisfeExpedienteDetalle = z.infer<typeof sisfeExpedienteDetalleSchema>;
export type SisfeNovedad = z.infer<typeof sisfeNovedadesResponseSchema>["lista"][number];
