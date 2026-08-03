import { aCentavos, aPesos } from "./dinero.js";
import { MetodoPago, EstadoPedido } from "./types/index.js";

// Conciliación de efectivo.
//
// Esta fórmula vive en `shared` y NO en el backend a propósito: la calculan DOS lados.
// El POS la necesita para mostrar el esperado en caja en vivo y para imprimir el corte
// estando offline; el backend la recalcula al recibir el cierre. Si cada uno tuviera su
// copia, podrían divergir sin que nadie lo note — y el número que el dueño usa para
// confiar en el sistema sería distinto según quién lo calcule.
//
//   esperadoEnCaja = fondoInicial + ventasEfectivo + entradas - gastos
//
// El conteo físico del efectivo y su diferencia contra el esperado se hacen FUERA del
// sistema, a propósito: el corte reporta el esperado en caja como referencia, pero no
// registra ni concilia el efectivo contado.
//
// LOS REEMBOLSOS NO SE RESTAN, a propósito. Un pedido cancelado ya queda excluido de
// `ventasEfectivo`, así que restar además su reembolso descontaría el mismo dinero dos
// veces. Ejemplo: fondo $500, venta de $100 en efectivo que luego se cancela y se
// devuelve. El cajón vuelve a $500; con la venta ya excluida, esperado = $500. Correcto.
//
// Ver CONTEXT.md §4.8.

export function calcularEsperadoEnCaja(
  fondoInicial: number,
  ventasEfectivo: number,
  entradas: number,
  gastos: number,
): number {
  // En centavos: sumar dinero en punto flotante desvía el corte de caja.
  const centavos =
    aCentavos(fondoInicial) + aCentavos(ventasEfectivo) + aCentavos(entradas) - aCentavos(gastos);

  return aPesos(centavos);
}

// ---------------------------------------------------------------------------
// Ventas del día
// ---------------------------------------------------------------------------
//
// El POS las calcula sobre sus pedidos locales (para operar offline); el backend, sobre
// los suyos. Mismo criterio en ambos lados, misma función.

export interface PedidoParaVentas {
  estado: EstadoPedido | string;
  metodoPago?: MetodoPago | string | null;
  total: number;
  reembolsado?: boolean;
  montoReembolso?: number;
}

export interface ResumenVentas {
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasTransfer: number;
  totalVentas: number;
  reembolsosEfectivo: number;
  numPedidos: number;
}

export function calcularVentas(pedidos: readonly PedidoParaVentas[]): ResumenVentas {
  // Un pedido cancelado no es una venta. Se excluye del ingreso; su reembolso se reporta
  // aparte, solo como dato informativo (no entra en la conciliación, ver arriba).
  const vendidos = pedidos.filter((p) => p.estado !== EstadoPedido.CANCELADO);

  const sumaPor = (metodo: MetodoPago): number =>
    aPesos(
      vendidos
        .filter((p) => p.metodoPago === metodo)
        .reduce((s, p) => s + aCentavos(p.total), 0),
    );

  const ventasEfectivo = sumaPor(MetodoPago.EFECTIVO);
  const ventasTarjeta = sumaPor(MetodoPago.TARJETA);
  const ventasTransfer = sumaPor(MetodoPago.TRANSFERENCIA);

  const reembolsosEfectivo = aPesos(
    pedidos
      .filter((p) => p.reembolsado === true && p.metodoPago === MetodoPago.EFECTIVO)
      .reduce((s, p) => s + aCentavos(p.montoReembolso ?? 0), 0),
  );

  return {
    ventasEfectivo,
    ventasTarjeta,
    ventasTransfer,
    totalVentas: aPesos(
      aCentavos(ventasEfectivo) + aCentavos(ventasTarjeta) + aCentavos(ventasTransfer),
    ),
    reembolsosEfectivo,
    numPedidos: vendidos.length,
  };
}
