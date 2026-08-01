import axios from "axios";
import {
  sisfeBusquedaResponseSchema,
  sisfeExpedienteDetalleSchema,
  sisfeNovedadesResponseSchema,
  type SisfeBusquedaResponse,
  type SisfeExpedienteDetalle,
  type SisfeNovedad,
} from "./schemas.js";

const SISFE_API_URL = "https://sisfe.justiciasantafe.gov.ar/iol";

export type BuscarExpedientesParams = {
  page?: number;
  size?: number;
  diasNovedades?: number;
  localidad?: string | number;
  organismo?: string | number;
  excluirArchivados?: boolean;
};

export class SisfeSessionExpiredError extends Error {
  constructor() {
    super("La sesion de SISFE vencio o fue rechazada");
  }
}

export const createSisfeClient = (token: string) => {
  const http = axios.create({
    baseURL: SISFE_API_URL,
    timeout: 30_000,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  http.interceptors.response.use(undefined, (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) throw new SisfeSessionExpiredError();
    throw error;
  });

  const buscarExpedientes = async (params: BuscarExpedientesParams = {}): Promise<SisfeBusquedaResponse> => {
    const { page = 1, size = 100, diasNovedades, ...filters } = params;
    const requestParams = { page, size, ...filters, ...(diasNovedades ? { diasNovedades } : {}) };
    const { data } = await http.get("/expedientes/findByFilter", { params: requestParams });
    return sisfeBusquedaResponseSchema.parse(data);
  };

  const buscarTodosExpedientes = async (params: Omit<BuscarExpedientesParams, "page"> = {}) => {
    const size = params.size ?? 100;
    const all: SisfeBusquedaResponse["lista"] = [];
    const seen = new Set<number>();
    for (let page = 1; page <= 100; page++) {
      const response = await buscarExpedientes({ ...params, page, size });
      const fresh = response.lista.filter((item) => !seen.has(item.id));
      fresh.forEach((item) => seen.add(item.id));
      all.push(...fresh);
      if (response.lista.length < size || fresh.length === 0) break;
    }
    return all;
  };

  const obtenerExpediente = async (idExpediente: number): Promise<SisfeExpedienteDetalle> => {
    const { data } = await http.get("/expedientes/findById", { params: { idExpediente } });
    return sisfeExpedienteDetalleSchema.parse(data);
  };

  const obtenerNovedades = async (idExpediente: number): Promise<SisfeNovedad[]> => {
    const { data } = await http.get("/expedientes/findNovedadesById", {
      params: { idExpediente, page: 1, size: 1000 },
    });
    return sisfeNovedadesResponseSchema.parse(data).lista;
  };

  return { buscarExpedientes, buscarTodosExpedientes, obtenerExpediente, obtenerNovedades };
};

export type SisfeClient = ReturnType<typeof createSisfeClient>;
