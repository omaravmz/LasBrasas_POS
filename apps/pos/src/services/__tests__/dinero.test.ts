import { describe, it, expect } from "vitest";
import { calcularTotal } from "@brasas/shared";

// El backend valida que `total == Σ(precioUnitario × cantidad)` comparando en Decimal.
// Si el POS suma en punto flotante, tarde o temprano manda un total como
// 59.699999999999996 y el servidor RECHAZA UNA VENTA LEGÍTIMA que el cliente ya pagó.
//
// Por eso el total se calcula en centavos enteros. Estos tests fijan ese comportamiento
// usando casos que el flotante SÍ rompe de verdad (verificados, no supuestos).

describe("calcularTotal", () => {
  it("suma precio × cantidad de cada línea", () => {
    const total = calcularTotal([
      { precioUnitario: 320, cantidad: 2 },
      { precioUnitario: 25.5, cantidad: 1 },
    ]);

    expect(total).toBe(665.5);
  });

  it("es exacto donde la multiplicación en flotante no lo es", () => {
    // Tres refrescos de $19.90. En flotante: 19.9 * 3 === 59.699999999999996.
    // Ese total no cuadraría contra la suma en Decimal del servidor.
    expect(19.9 * 3).not.toBe(59.7);

    expect(calcularTotal([{ precioUnitario: 19.9, cantidad: 3 }])).toBe(59.7);
  });

  it("es exacto donde la suma en flotante no lo es", () => {
    // 10.1 + 20.2 en flotante da 30.299999999999997.
    expect(10.1 + 20.2).not.toBe(30.3);

    const total = calcularTotal([
      { precioUnitario: 10.1, cantidad: 1 },
      { precioUnitario: 20.2, cantidad: 1 },
    ]);

    expect(total).toBe(30.3);
  });

  it("el caso clásico: 0.1 + 0.2", () => {
    expect(0.1 + 0.2).not.toBe(0.3);

    const total = calcularTotal([
      { precioUnitario: 0.1, cantidad: 1 },
      { precioUnitario: 0.2, cantidad: 1 },
    ]);

    expect(total).toBe(0.3);
  });

  it("un pedido vacío suma cero", () => {
    expect(calcularTotal([])).toBe(0);
  });

  it("acepta un producto de cortesía (precio cero)", () => {
    expect(calcularTotal([{ precioUnitario: 0, cantidad: 2 }])).toBe(0);
  });

  it("un pedido realista con varios precios problemáticos cuadra al centavo", () => {
    // Ojo: en este pedido concreto los errores del flotante se CANCELAN entre sí y la
    // suma ingenua acierta por casualidad. Es exactamente lo que hace insidioso al bug:
    // funciona la mayoría de las veces, hasta que un día no. Por eso el total no puede
    // depender de la suerte.
    expect(
      calcularTotal([
        { precioUnitario: 19.9, cantidad: 3 }, // 59.70
        { precioUnitario: 8.7, cantidad: 3 },  // 26.10
        { precioUnitario: 320, cantidad: 1 },  // 320.00
      ]),
    ).toBe(405.8);
  });
});
