import { apiFetch } from "../lib/api.js";
import type { EstadoPedido, MetodoPago } from "@brasas/shared";

export type TipoMovimientoCaja = "ENTRADA" | "GASTO";

export interface ResumenVentas {
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  reembolsosEfectivo: number;
  numPedidos: number;
}

export interface PedidoDelDia {
  id: string;
  folio: number;
  total: number;
  metodoPago: MetodoPago | null;
  estado: EstadoPedido;
  creadoEn: string;
}

export interface VentasDia {
  fecha: string;
  resumen: ResumenVentas;
  pedidos: PedidoDelDia[];
}

export interface MovimientoCaja {
  id: string;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
  creadoEn: string;
}

export interface TotalesMovimientos {
  entradas: number;
  gastos: number;
}

export interface CierreInfo {
  id: string;
  fondoInicial: number;
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  reembolsosEfectivo: number;
  totalEntradas: number;
  totalGastos: number;
  esperadoEnCaja: number;
  conteoFisico: number;
  diferencia: number;
  gastos: { id: string; concepto: string; monto: number }[];
  entradas: { id: string; concepto: string; monto: number }[];
  notas: string | null;
  cerradoEn: string;
}

export interface EstadoCaja {
  fecha: string;
  apertura: { id: string; fondoInicial: number; notas: string | null; abiertoEn: string } | null;
  cierre: CierreInfo | null;
  ventasDelDia: ResumenVentas | null;
  movimientos: MovimientoCaja[];
  totalesMovimientos: TotalesMovimientos;
  esperadoEnCaja: number | null;
}

export async function getEstadoCaja(): Promise<EstadoCaja> {
  return apiFetch<EstadoCaja>("/caja/estado");
}

export async function getVentasDia(): Promise<VentasDia> {
  return apiFetch<VentasDia>("/caja/ventas");
}

export async function abrirDia(id: string, fondoInicial: number, notas?: string): Promise<void> {
  await apiFetch<unknown>("/caja/apertura", {
    method: "POST",
    body: JSON.stringify({ id, fondoInicial, ...(notas !== undefined && { notas }) }),
  });
}

export async function registrarMovimiento(
  id: string,
  tipo: TipoMovimientoCaja,
  concepto: string,
  monto: number,
): Promise<MovimientoCaja> {
  return apiFetch<MovimientoCaja>("/caja/movimientos", {
    method: "POST",
    body: JSON.stringify({ id, tipo, concepto, monto }),
  });
}

export async function eliminarMovimiento(id: string): Promise<void> {
  await apiFetch<unknown>(`/caja/movimientos/${id}`, { method: "DELETE" });
}

export async function cerrarDia(
  id: string,
  conteoFisico: number,
  notas?: string,
): Promise<CierreInfo> {
  return apiFetch<CierreInfo>("/caja/cierre", {
    method: "POST",
    body: JSON.stringify({ id, conteoFisico, ...(notas !== undefined && { notas }) }),
  });
}
