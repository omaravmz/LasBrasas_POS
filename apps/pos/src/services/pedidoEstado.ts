import { apiFetch } from "../lib/api.js";
import { diaOperativo } from "./diaOperativo.js";
import type { EstadoPedido, OrigenPedido } from "@brasas/shared";

export interface PedidoActivo {
  id: string;
  folio: number;
  estado: EstadoPedido;
  origen: OrigenPedido;
  total: number;
  notas?: string;
  horaRecoleccion?: string;
  creadoEn: string;
  items: {
    id: string;
    cantidad: number;
    productoNombre: string;
    notas?: string;
  }[];
}

export async function cargarPedidosActivos(): Promise<PedidoActivo[]> {
  // La jornada la estampa la terminal (BD-02); el servidor filtra por ella, no por su reloj.
  return apiFetch<PedidoActivo[]>(`/pedidos/activos?fecha=${diaOperativo()}`);
}

export async function actualizarEstado(
  pedidoId: string,
  nuevoEstado: EstadoPedido
): Promise<void> {
  await apiFetch<unknown>(`/pedidos/${pedidoId}/estado`, {
    method: "PATCH",
    body: JSON.stringify({ estado: nuevoEstado }),
  });
}
