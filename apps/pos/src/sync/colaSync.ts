import { apiFetch, esClienteDesactualizado } from "../lib/api.js";
import { getLocalDB } from "../db/db.js";
import { sincronizarPendientes } from "../services/syncQueue.js";

// Motor de sincronización de la terminal (BD-19).
//
// EL INVARIANTE: la cola se drena EN ORDEN, y una operación que falla DETIENE el resto.
//
//   AperturaDia(D) → Pedidos(D) → MovimientosCaja(D) → CierreDia(D)
//
// No es una preferencia de estilo, es lo que sostiene la corrección del sistema:
//
//   - El servidor rechaza un pedido cuya fechaOperativa no tenga apertura en la nube
//     (DIA_NO_ABIERTO). Si los pedidos se enviaran antes que la apertura, una terminal
//     que vendió todo el día sin conexión vería TODAS sus ventas rechazadas.
//
//   - El servidor rechaza un pedido de un día ya cerrado (DIA_YA_CERRADO). Si el cierre
//     se enviara antes que los pedidos, el corte se calcularía sin esas ventas y los
//     pedidos rezagados serían rechazados después. Un corte incorrecto, dado por bueno.
//
// Saltarse un eslabón roto y continuar es exactamente como se corrompe una contabilidad
// en silencio. Por eso, ante un fallo, se detiene todo y se reintenta después.

export type ResultadoCola =
  | { estado: "COMPLETO" }
  | { estado: "SIN_CONEXION" }
  | { estado: "CLIENTE_DESACTUALIZADO" }
  | { estado: "DETENIDO"; en: string; motivo: string };

// Marca dónde se detuvo la cola, para poder mostrarlo en la interfaz.
let ultimoResultado: ResultadoCola = { estado: "COMPLETO" };

export function getUltimoResultado(): ResultadoCola {
  return ultimoResultado;
}

export async function sincronizarTodo(): Promise<ResultadoCola> {
  ultimoResultado = await drenar();
  return ultimoResultado;
}

async function drenar(): Promise<ResultadoCola> {
  const db = await getLocalDB();

  try {
    // ---- 1. Aperturas -------------------------------------------------------
    // Van primero SIEMPRE: sin ellas, el servidor rechaza los pedidos del día.
    for (const apertura of await db.getAperturasPendientesSync()) {
      await apiFetch<unknown>("/caja/apertura", {
        method: "POST",
        body: JSON.stringify({
          id: apertura.id,
          fecha: apertura.fechaOperativa,
          fondoInicial: apertura.fondoInicial,
          ...(apertura.notas !== undefined && { notas: apertura.notas }),
        }),
      });

      await db.marcarCajaSincronizada("apertura", apertura.id);
    }

    // ---- 2. Pedidos ---------------------------------------------------------
    // La apertura de su día ya está arriba. syncQueue se encarga del lote y de apartar
    // los pedidos rechazados en firme sin borrarlos.
    await sincronizarPendientes();

    // Si quedan pedidos pendientes con causa reintentable, el cierre NO puede irse
    // todavía: se calcularía un corte sin esas ventas.
    const pedidosPendientes = await db.getPedidosPendientesSync();

    // ---- 3. Movimientos de caja --------------------------------------------
    for (const movimiento of await db.getMovimientosPendientesSync()) {
      await apiFetch<unknown>("/caja/movimientos", {
        method: "POST",
        body: JSON.stringify({
          id: movimiento.id,
          fecha: movimiento.fechaOperativa,
          tipo: movimiento.tipo,
          concepto: movimiento.concepto,
          monto: movimiento.monto,
        }),
      });

      await db.marcarCajaSincronizada("movimiento", movimiento.id);
    }

    // Borrados de movimientos que el servidor todavía tiene.
    for (const movimiento of await db.getMovimientosEliminadosPendientes()) {
      await apiFetch<unknown>(`/caja/movimientos/${movimiento.id}`, { method: "DELETE" });
      // Solo ahora desaparece la fila local: si el DELETE hubiera fallado, el movimiento
      // seguiría vivo en la nube y el corte no cuadraría.
      await db.purgarMovimiento(movimiento.id);
    }

    // ---- 4. Cierres ---------------------------------------------------------
    if (pedidosPendientes.length > 0) {
      return {
        estado: "DETENIDO",
        en: "pedidos",
        motivo:
          `Quedan ${pedidosPendientes.length} pedidos sin sincronizar. ` +
          "El cierre del día espera: enviarlo ahora produciría un corte sin esas ventas.",
      };
    }

    for (const cierre of await db.getCierresPendientesSync()) {
      await apiFetch<unknown>("/caja/cierre", {
        method: "POST",
        body: JSON.stringify({
          id: cierre.id,
          fecha: cierre.fechaOperativa,
          ...(cierre.notas !== undefined && { notas: cierre.notas }),
        }),
      });

      await db.marcarCajaSincronizada("cierre", cierre.id);
    }

    return { estado: "COMPLETO" };
  } catch (err) {
    if (esClienteDesactualizado(err)) {
      // La app está por debajo de la versión mínima. Se deja de sincronizar, pero la
      // terminal sigue vendiendo y la cola queda intacta.
      return { estado: "CLIENTE_DESACTUALIZADO" };
    }

    if (esErrorDelServidor(err)) {
      const { code, message } = err as { code: string; message: string };
      return { estado: "DETENIDO", en: "caja", motivo: `${code}: ${message}` };
    }

    // Sin conexión: no es un error, es el estado normal de una terminal offline.
    // La cola queda intacta y se reintenta al reconectar.
    return { estado: "SIN_CONEXION" };
  }
}

function esErrorDelServidor(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown };
  return typeof e.code === "string";
}
