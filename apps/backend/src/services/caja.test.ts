import { describe, it, expect } from "vitest";
import { calcularEsperadoEnCaja, totalizarMovimientos } from "./caja.js";
import type { MovimientoCajaInfo } from "./caja.js";

function mov(
  tipo: MovimientoCajaInfo["tipo"],
  concepto: string,
  monto: number,
): MovimientoCajaInfo {
  return { id: crypto.randomUUID(), tipo, concepto, monto, creadoEn: new Date().toISOString() };
}

describe("totalizarMovimientos", () => {
  it("suma entradas y gastos por separado", () => {
    const totales = totalizarMovimientos([
      mov("ENTRADA", "Fondo extra", 200),
      mov("GASTO", "Gas", 150),
      mov("GASTO", "Servilletas", 50),
      mov("ENTRADA", "Préstamo", 100),
    ]);

    expect(totales.entradas).toBe(300);
    expect(totales.gastos).toBe(200);
  });

  it("devuelve ceros cuando no hay movimientos", () => {
    expect(totalizarMovimientos([])).toEqual({ entradas: 0, gastos: 0 });
  });
});

describe("calcularEsperadoEnCaja", () => {
  it("suma fondo inicial y ventas en efectivo", () => {
    expect(calcularEsperadoEnCaja(500, 1200, 0, 0)).toBe(1700);
  });

  it("RESTA los gastos del esperado", () => {
    // El bug original: los gastos se guardaban pero no afectaban el esperado.
    expect(calcularEsperadoEnCaja(500, 1200, 0, 200)).toBe(1500);
  });

  it("SUMA las entradas al esperado", () => {
    expect(calcularEsperadoEnCaja(500, 1200, 300, 0)).toBe(2000);
  });

  it("combina fondo, ventas, entradas y gastos", () => {
    // 500 + 1200 + 300 - 200 = 1800
    expect(calcularEsperadoEnCaja(500, 1200, 300, 200)).toBe(1800);
  });

  it("un gasto mayor a lo disponible deja el esperado en negativo (no lo trunca)", () => {
    expect(calcularEsperadoEnCaja(100, 0, 0, 250)).toBe(-150);
  });

  it("no descuenta dos veces un pedido en efectivo cancelado", () => {
    // Fondo $500, venta de $100 en efectivo, luego cancelada y devuelta.
    // El pedido cancelado queda fuera de ventasEfectivo (lo filtra
    // calcularVentasDia), así que el esperado vuelve al fondo: $500.
    // Restar además el reembolso daría $400: descuento doble.
    const ventasEfectivoTrasCancelar = 0;
    expect(calcularEsperadoEnCaja(500, ventasEfectivoTrasCancelar, 0, 0)).toBe(500);
  });
});
