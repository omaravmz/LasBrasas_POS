import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { CodigoError } from "@brasas/shared";
import { crearPedido, type CrearPedidoInput } from "./pedido.js";

export type PedidoSyncInput = Omit<CrearPedidoInput, "sucursalId" | "dispositivoId">;

export interface FalloSync {
  id: string;
  code: string;
  message: string;
  // true  → el POS puede reintentar solo (la causa puede desaparecer).
  // false → no sirve reintentar: hace falta que una persona lo resuelva.
  reintentable: boolean;
}

export interface ResultadoSync {
  sincronizados: string[];
  // El primero que falló. Detiene el lote.
  fallido: FalloSync | null;
  // Los que venían detrás del fallido y NO se intentaron. Siguen en la cola del POS.
  bloqueados: string[];
}

// Errores que no van a arreglarse solos: reintentar produce el mismo resultado. Exigen
// intervención humana. El resto (incluidos los 500 y los cortes de red) sí se reintentan.
const PERMANENTES = new Set<string>([
  CodigoError.FOLIO_DUPLICADO,
  CodigoError.CONFLICTO_IDEMPOTENCIA,
  CodigoError.TOTAL_INCONSISTENTE,
  CodigoError.PRECIO_INVALIDO,
  CodigoError.CATALOGO_INCONSISTENTE,
  CodigoError.DIA_YA_CERRADO,
  "VALIDATION_ERROR",
]);

function clasificar(err: unknown, id: string): FalloSync {
  if (err instanceof AppError) {
    return {
      id,
      code: err.code,
      message: err.message,
      reintentable: !PERMANENTES.has(err.code),
    };
  }

  return {
    id,
    code: "INTERNAL_ERROR",
    message: err instanceof Error ? err.message : "Error desconocido",
    reintentable: true,
  };
}

// Sincroniza un lote de pedidos hechos offline.
//
// EL LOTE SE DETIENE EN EL PRIMER FALLO. No es una limitación: es el invariante que
// sostiene la corrección del sistema (ver DISENO_BLOQUE1.md §9).
//
// El comportamiento anterior —acumular errores y seguir con el siguiente pedido— parece
// más robusto pero es peligroso en cuanto la cola lleva más que pedidos. Una operación
// que falla puede ser prerrequisito de las que vienen detrás: si la apertura del día no
// entra, todos los pedidos de ese día se rechazarían por DIA_NO_ABIERTO; si además el
// cierre siguiera adelante, se calcularía un corte sin esas ventas. Saltarse un eslabón
// roto y seguir es como se corrompe una contabilidad en silencio.
//
// Al detenerse, los pedidos posteriores ni se intentan: quedan intactos en la cola del
// POS y se reenvían en el siguiente ciclo, en el mismo orden.
//
// Idempotente: reenviar un pedido ya sincronizado devuelve el existente, no lo duplica.
export async function sincronizarPedidosLote(
  pedidos: PedidoSyncInput[],
  sucursalId: string,
  dispositivoId: string
): Promise<ResultadoSync> {
  const sincronizados: string[] = [];

  for (let i = 0; i < pedidos.length; i += 1) {
    const pedido = pedidos[i]!;

    try {
      await crearPedido({ ...pedido, sucursalId, dispositivoId });
      sincronizados.push(pedido.id);
    } catch (err) {
      return {
        sincronizados,
        fallido: clasificar(err, pedido.id),
        bloqueados: pedidos.slice(i + 1).map((p) => p.id),
      };
    }
  }

  return { sincronizados, fallido: null, bloqueados: [] };
}

// Folio máximo que el servidor conoce para una sucursal y día. El POS lo usa para
// recuperarse si su contador local se quedó atrás (p. ej. tras restaurar el dispositivo):
// salta hacia adelante en vez de repetir folios ya usados. Ver DISENO_BLOQUE1.md §3.
export async function folioMaximo(sucursalId: string, fecha: Date): Promise<number> {
  const resultado = await prisma.pedido.aggregate({
    where: { sucursalId, fechaOperativa: fecha },
    _max: { folio: true },
  });

  return resultado._max.folio ?? 0;
}
