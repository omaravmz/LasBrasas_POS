import { apiFetch } from "../lib/api.js";

export interface ResumenVentas {
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  reembolsosEfectivo: number;
  numPedidos: number;
}

export interface CierreInfo {
  id: string;
  fondoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  reembolsosEfectivo: number;
  conteoFisico: number;
  diferencia: number;
  gastos: { id: string; concepto: string; monto: number }[];
  notas: string | null;
  cerradoEn: string;
}

export interface EstadoCaja {
  fecha: string;
  apertura: { id: string; fondoInicial: number; notas: string | null; abiertoEn: string } | null;
  cierre: CierreInfo | null;
  ventasDelDia: ResumenVentas | null;
}

export interface GastoInput {
  id: string;
  concepto: string;
  monto: number;
}

export async function getEstadoCaja(): Promise<EstadoCaja> {
  return apiFetch<EstadoCaja>("/caja/estado");
}

export async function abrirDia(id: string, fondoInicial: number, notas?: string): Promise<void> {
  await apiFetch<unknown>("/caja/apertura", {
    method: "POST",
    body: JSON.stringify({ id, fondoInicial, ...(notas !== undefined && { notas }) }),
  });
}

export async function cerrarDia(
  id: string,
  conteoFisico: number,
  gastos: GastoInput[],
  notas?: string,
): Promise<CierreInfo> {
  return apiFetch<CierreInfo>("/caja/cierre", {
    method: "POST",
    body: JSON.stringify({ id, conteoFisico, gastos, ...(notas !== undefined && { notas }) }),
  });
}
