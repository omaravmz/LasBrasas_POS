import { apiFetch } from "../lib/api.js";
import { getLocalDB } from "../db/db.js";
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

  // El tablero de Pedidos lee del servidor, pero la caja lee de la base LOCAL. Si el estado
  // no se replica localmente, un pedido entregado sigue apareciendo cancelable en Caja y uno
  // cancelado sigue contando en las ventas del turno. Se replica tras confirmar en servidor.
  const db = await getLocalDB();
  await db.actualizarEstadoPedido(pedidoId, nuevoEstado);
}
