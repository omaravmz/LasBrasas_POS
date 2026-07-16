// Aritmética de dinero en el cliente.
//
// El backend valida que `total == Σ(precioUnitario × cantidad)` comparando en Decimal
// (ver pedidoValidacion.ts). Si el POS suma en punto flotante, tarde o temprano manda
// un total como 665.5000000000001 y el servidor RECHAZA UNA VENTA LEGÍTIMA que el
// cliente ya pagó.
//
// La solución es no sumar en flotante nunca: se trabaja en centavos enteros y solo se
// vuelve a pesos al final. Un entero no arrastra error.
//
// (Los precios son valores de 2 decimales: 320.00, 25.50. Convertirlos a centavos con
// Math.round es exacto para todo el rango de precios de un menú.)

export function aCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

export function aPesos(centavos: number): number {
  return centavos / 100;
}

export interface LineaMonetaria {
  precioUnitario: number;
  cantidad: number;
}

// Total de un pedido, calculado sin punto flotante.
export function calcularTotal(lineas: readonly LineaMonetaria[]): number {
  const centavos = lineas.reduce(
    (suma, l) => suma + aCentavos(l.precioUnitario) * l.cantidad,
    0,
  );

  return aPesos(centavos);
}
