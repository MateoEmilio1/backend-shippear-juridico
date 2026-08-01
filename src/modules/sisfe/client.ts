import axios from "axios";
import {
  sisfeBusquedaResponseSchema,
  sisfeExpedienteDetalleSchema,
  type SisfeBusquedaResponse,
  type SisfeExpedienteDetalle,
} from "./schemas.js";

const SISFE_API_URL = "https://sisfe.justiciasantafe.gov.ar/iol";

export type BuscarExpedientesParams = {
  page?: number;
  size?: number;
  diasNovedades?: number;
};

export const createSisfeClient = (token: string) => {
  const http = axios.create({
    baseURL: SISFE_API_URL,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  const buscarExpedientes = async (params: BuscarExpedientesParams = {}): Promise<SisfeBusquedaResponse> => {
    const { page = 1, size = 25, diasNovedades = 10 } = params;
    const { data } = await http.get("/expedientes/findByFilter", { params: { page, size, diasNovedades } });
    return sisfeBusquedaResponseSchema.parse(data);
  };

  const obtenerExpediente = async (idExpediente: number): Promise<SisfeExpedienteDetalle> => {
    const { data } = await http.get("/expedientes/findById", { params: { idExpediente } });
    return sisfeExpedienteDetalleSchema.parse(data);
  };

  return { buscarExpedientes, obtenerExpediente };
};

export type SisfeClient = ReturnType<typeof createSisfeClient>;
