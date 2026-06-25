import { apiFetch } from "../lib/api.js";
import type { EstadoPedido, OrigenPedido } from "@brasas/shared";

export interface PedidoActivo {
  id: string;
  folio: number;
  estado: EstadoPedido;
  origen: OrigenPedido;
  total: number;
  creadoEn: string;
  items: {
    id: string;
    cantidad: number;
    productoNombre: string;
    notas?: string;
  }[];
}

export async function cargarPedidosActivos(): Promise<PedidoActivo[]> {
  return apiFetch<PedidoActivo[]>("/pedidos/activos");
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
