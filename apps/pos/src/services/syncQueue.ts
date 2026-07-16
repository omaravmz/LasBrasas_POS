import { getLocalDB } from "../db/db.js";
import { apiFetch, esClienteDesactualizado } from "../lib/api.js";
import { buildPayload } from "./pedidoService.js";
import { reconciliarFolio } from "./folio.js";
import { diaOperativo } from "./diaOperativo.js";
import type { PedidoLocal } from "../db/types.js";

interface FalloSync {
  id: string;
  code: string;
  message: string;
  reintentable: boolean;
}

interface ResultadoSync {
  sincronizados: string[];
  fallido: FalloSync | null;
  bloqueados: string[];
}

export interface EstadoCola {
  pendientes: number;
  // Pedidos rechazados en firme por el servidor. Requieren que una persona los resuelva.
  conError: PedidoLocal[];
  // La app está por debajo de la versión mínima: no puede sincronizar hasta actualizarse.
  clienteDesactualizado: boolean;
}

let clienteDesactualizado = false;

export async function getPendientesSinc(): Promise<PedidoLocal[]> {
  const db = await getLocalDB();
  return db.getPedidosPendientesSync();
}

export async function getEstadoCola(): Promise<EstadoCola> {
  const db = await getLocalDB();
  const [pendientes, conError] = await Promise.all([
    db.getPedidosPendientesSync(),
    db.getPedidosConError(),
  ]);

  return { pendientes: pendientes.length, conError, clienteDesactualizado };
}

// Drena la cola de pedidos pendientes.
//
// REGLA INVIOLABLE: esta función NUNCA borra un pedido de la cola porque el servidor lo
// haya rechazado. La venta ocurrió, el cliente pagó y el dinero está en el cajón: perder
// ese registro es peor que cualquier error de sincronización. Un pedido solo sale de la
// cola cuando el servidor confirma que lo tiene.
//
// El lote se detiene en el primer fallo (FIFO). Los pedidos que venían detrás no se
// intentan siquiera: siguen en la cola, en orden, para el próximo ciclo. Ver
// DISENO_BLOQUE1.md §9.
export async function sincronizarPendientes(): Promise<void> {
  const pendientes = await getPendientesSinc();
  if (pendientes.length === 0) return;

  let resultado: ResultadoSync;

  try {
    resultado = await apiFetch<ResultadoSync>("/sync/pedidos", {
      method: "POST",
      body: JSON.stringify({ pedidos: pendientes.map(buildPayload) }),
    });

    clienteDesactualizado = false;
  } catch (err) {
    if (esClienteDesactualizado(err)) {
      // La app está desactualizada. Se deja de sincronizar, pero la venta sigue
      // funcionando y la cola queda intacta: se reenviará entera tras actualizar.
      clienteDesactualizado = true;
      return;
    }

    // Sin conexión o error transitorio: se reintenta en el próximo evento online.
    // La cola no se toca.
    return;
  }

  const db = await getLocalDB();

  if (resultado.sincronizados.length > 0) {
    await db.marcarSincronizados(resultado.sincronizados);
  }

  if (resultado.fallido) {
    if (resultado.fallido.reintentable) {
      // La causa puede desaparecer sola (p. ej. DIA_NO_ABIERTO: la apertura todavía no
      // había sincronizado). Se deja en la cola tal cual y se reintenta después.
      return;
    }

    // Rechazo en firme: reintentar dará exactamente el mismo resultado. Se aparta de la
    // cola —para que no bloquee indefinidamente a los demás— pero NO se borra: queda
    // visible para que el encargado lo resuelva.
    await db.marcarErrorSync(
      resultado.fallido.id,
      `${resultado.fallido.code}: ${resultado.fallido.message}`,
    );
  }

  // Si el servidor conoce folios más altos que los que la terminal puede ver en sus
  // propios datos, se ajusta el contador para no repetirlos.
  await reconciliarFolioConServidor();
}

async function reconciliarFolioConServidor(): Promise<void> {
  try {
    const { folioMaximo } = await apiFetch<{ folioMaximo: number }>(
      `/pedidos/folio-maximo?fecha=${diaOperativo()}`,
    );
    await reconciliarFolio(folioMaximo);
  } catch {
    // No es crítico: el cálculo local sigue siendo válido mientras la terminal conserve
    // sus pedidos. Esto solo cubre el caso de una terminal que los perdió.
  }
}
