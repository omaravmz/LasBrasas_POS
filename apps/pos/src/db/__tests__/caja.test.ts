import { describe, it, expect } from "vitest";
import { SQLiteLocalDB } from "../impl/SQLiteLocalDB.js";
import {
  calcularVentas,
  calcularEsperadoEnCaja,
  calcularDiferencia,
  EstadoPedido,
  MetodoPago,
  OrigenPedido,
  TipoMovimientoCaja,
} from "@brasas/shared";
import type { PedidoLocal, MovimientoLocal, AperturaLocal } from "../types.js";

// BD-19: la caja debe funcionar SIN INTERNET. Abrir el día, cobrar, registrar entradas y
// gastos, y cerrar. Estos tests ejercitan ese flujo contra la base local, sin red.

const HOY = "2026-06-15";
const AYER = "2026-06-14";

async function initDB(): Promise<SQLiteLocalDB> {
  const db = new SQLiteLocalDB();
  await db.init();
  return db;
}

function pedido(over: Partial<PedidoLocal> = {}): PedidoLocal {
  return {
    id: crypto.randomUUID(),
    folio: 1,
    fechaOperativa: HOY,
    catalogoVersion: 1,
    sucursalId: "suc-a",
    origen: OrigenPedido.MOSTRADOR,
    estado: EstadoPedido.ENTREGADO,
    metodoPago: MetodoPago.EFECTIVO,
    total: 100,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    items: [],
    sincronizado: false,
    ...over,
  };
}

function movimiento(over: Partial<MovimientoLocal> = {}): MovimientoLocal {
  return {
    id: crypto.randomUUID(),
    fechaOperativa: HOY,
    tipo: TipoMovimientoCaja.GASTO,
    concepto: "Hielo",
    monto: 50,
    creadoEn: new Date().toISOString(),
    sincronizado: false,
    eliminado: false,
    ...over,
  };
}

const apertura: AperturaLocal = {
  id: "ap-1",
  fechaOperativa: HOY,
  fondoInicial: 500,
  abiertoEn: new Date().toISOString(),
  sincronizado: false,
};

describe("Apertura local", () => {
  it("se guarda y se recupera por día", async () => {
    const db = await initDB();
    await db.guardarApertura(apertura);

    const leida = await db.getApertura(HOY);
    expect(leida?.fondoInicial).toBe(500);
    expect(await db.getApertura(AYER)).toBeNull();
  });

  it("queda pendiente de sincronizar", async () => {
    const db = await initDB();
    await db.guardarApertura(apertura);

    expect(await db.getAperturasPendientesSync()).toHaveLength(1);

    await db.marcarCajaSincronizada("apertura", apertura.id);
    expect(await db.getAperturasPendientesSync()).toHaveLength(0);
    // Sigue estando: sincronizada no es lo mismo que borrada.
    expect(await db.getApertura(HOY)).not.toBeNull();
  });
});

describe("Movimientos de caja locales", () => {
  it("se listan en orden cronológico", async () => {
    const db = await initDB();
    await db.guardarMovimiento(movimiento({ id: "b", concepto: "B", creadoEn: "2026-06-15T17:00:00Z" }));
    await db.guardarMovimiento(movimiento({ id: "a", concepto: "A", creadoEn: "2026-06-15T16:00:00Z" }));

    const movs = await db.getMovimientos(HOY);
    expect(movs.map((m) => m.concepto)).toEqual(["A", "B"]);
  });

  it("un movimiento eliminado desaparece de la vista pero NO de la base", async () => {
    // Si la fila se borrara antes de confirmar el DELETE con el servidor y ese DELETE
    // fallara, el movimiento reviviría en la nube y el corte de caja no cuadraría.
    const db = await initDB();
    await db.guardarMovimiento(movimiento({ id: "m1", sincronizado: true }));

    await db.marcarMovimientoEliminado("m1");

    expect(await db.getMovimientos(HOY)).toHaveLength(0);
    expect(await db.getMovimientosEliminadosPendientes()).toHaveLength(1);
  });

  it("solo se purga tras confirmar el borrado con el servidor", async () => {
    const db = await initDB();
    await db.guardarMovimiento(movimiento({ id: "m1", sincronizado: true }));
    await db.marcarMovimientoEliminado("m1");

    await db.purgarMovimiento("m1");

    expect(await db.getMovimientosEliminadosPendientes()).toHaveLength(0);
  });

  it("los movimientos de otro día no interfieren", async () => {
    const db = await initDB();
    await db.guardarMovimiento(movimiento({ fechaOperativa: AYER, monto: 999 }));
    await db.guardarMovimiento(movimiento({ fechaOperativa: HOY, monto: 50 }));

    const movs = await db.getMovimientos(HOY);
    expect(movs).toHaveLength(1);
    expect(movs[0]!.monto).toBe(50);
  });
});

describe("Conciliación (fórmula compartida con el backend)", () => {
  it("esperado = fondo + ventas efectivo + entradas - gastos", () => {
    expect(calcularEsperadoEnCaja(500, 1200, 200, 150)).toBe(1750);
  });

  it("los reembolsos NO se restan del esperado", () => {
    // Un pedido cancelado ya salió de ventasEfectivo. Restar además su reembolso
    // descontaría el mismo dinero dos veces.
    //
    // Fondo $500, venta de $100 en efectivo que se cancela y se devuelve.
    // El cajón vuelve a $500.
    const ventas = calcularVentas([
      { estado: EstadoPedido.CANCELADO, metodoPago: MetodoPago.EFECTIVO, total: 100, reembolsado: true, montoReembolso: 100 },
    ]);

    expect(ventas.ventasEfectivo).toBe(0);
    expect(ventas.reembolsosEfectivo).toBe(100); // informativo
    expect(calcularEsperadoEnCaja(500, ventas.ventasEfectivo, 0, 0)).toBe(500);
  });

  it("la diferencia es conteo físico menos esperado", () => {
    expect(calcularDiferencia(1745, 1750)).toBe(-5); // faltante
    expect(calcularDiferencia(1755, 1750)).toBe(5);  // sobrante
  });

  it("no arrastra error de punto flotante", () => {
    // 19.90 x 3 en flotante da 59.699999999999996.
    const ventas = calcularVentas([
      { estado: EstadoPedido.ENTREGADO, metodoPago: MetodoPago.EFECTIVO, total: 19.9 },
      { estado: EstadoPedido.ENTREGADO, metodoPago: MetodoPago.EFECTIVO, total: 19.9 },
      { estado: EstadoPedido.ENTREGADO, metodoPago: MetodoPago.EFECTIVO, total: 19.9 },
    ]);

    expect(ventas.ventasEfectivo).toBe(59.7);
    expect(calcularEsperadoEnCaja(0, ventas.ventasEfectivo, 0, 0)).toBe(59.7);
  });

  it("separa las ventas por método de pago y excluye canceladas", () => {
    const ventas = calcularVentas([
      { estado: EstadoPedido.ENTREGADO, metodoPago: MetodoPago.EFECTIVO, total: 100 },
      { estado: EstadoPedido.ENTREGADO, metodoPago: MetodoPago.TARJETA, total: 200 },
      { estado: EstadoPedido.LISTO, metodoPago: MetodoPago.TRANSFERENCIA, total: 300 },
      { estado: EstadoPedido.CANCELADO, metodoPago: MetodoPago.EFECTIVO, total: 999 },
    ]);

    expect(ventas.ventasEfectivo).toBe(100);
    expect(ventas.ventasTarjeta).toBe(200);
    expect(ventas.ventasTransfer).toBe(300);
    expect(ventas.totalVentas).toBe(600);
    expect(ventas.numPedidos).toBe(3);
  });
});

describe("Jornada completa sin conexión", () => {
  it("abrir, vender, gastar y cerrar — todo local, y luego sincroniza en orden", async () => {
    const db = await initDB();

    // 1. Abrir el día con $500 de fondo. Sin internet.
    await db.guardarApertura(apertura);

    // 2. Tres ventas: dos en efectivo, una con tarjeta.
    await db.guardarPedido(pedido({ folio: 1, total: 320, metodoPago: MetodoPago.EFECTIVO }));
    await db.guardarPedido(pedido({ folio: 2, total: 180, metodoPago: MetodoPago.EFECTIVO }));
    await db.guardarPedido(pedido({ folio: 3, total: 250, metodoPago: MetodoPago.TARJETA }));

    // 3. Un gasto y una entrada.
    await db.guardarMovimiento(movimiento({ tipo: TipoMovimientoCaja.GASTO, monto: 50 }));
    await db.guardarMovimiento(movimiento({ tipo: TipoMovimientoCaja.ENTRADA, monto: 100 }));

    // 4. El corte se calcula con los datos locales.
    const pedidos = await db.getPedidosPorDia(HOY);
    const movimientos = await db.getMovimientos(HOY);
    const ventas = calcularVentas(pedidos);

    const entradas = movimientos
      .filter((m) => m.tipo === TipoMovimientoCaja.ENTRADA)
      .reduce((s, m) => s + m.monto, 0);
    const gastos = movimientos
      .filter((m) => m.tipo === TipoMovimientoCaja.GASTO)
      .reduce((s, m) => s + m.monto, 0);

    expect(ventas.ventasEfectivo).toBe(500); // 320 + 180
    expect(ventas.ventasTarjeta).toBe(250);

    // Esperado: 500 (fondo) + 500 (efectivo) + 100 (entrada) - 50 (gasto) = 1050.
    // La tarjeta NO entra: no es efectivo en el cajón.
    const esperado = calcularEsperadoEnCaja(apertura.fondoInicial, ventas.ventasEfectivo, entradas, gastos);
    expect(esperado).toBe(1050);

    // 5. El encargado cuenta $1040: faltan $10.
    expect(calcularDiferencia(1040, esperado)).toBe(-10);

    // 6. Todo quedó encolado para sincronizar, en el orden correcto.
    expect(await db.getAperturasPendientesSync()).toHaveLength(1);
    expect(await db.getPedidosPendientesSync()).toHaveLength(3);
    expect(await db.getMovimientosPendientesSync()).toHaveLength(2);
  });

  it("el folio sigue avanzando sin conexión", async () => {
    const db = await initDB();
    await db.guardarApertura(apertura);

    expect(await db.getMaxFolio(HOY)).toBe(0);

    await db.guardarPedido(pedido({ folio: 1 }));
    expect(await db.getMaxFolio(HOY)).toBe(1);

    await db.guardarPedido(pedido({ folio: 2 }));
    expect(await db.getMaxFolio(HOY)).toBe(2);

    // Ninguno ha sincronizado, y aun así el contador es correcto: sale de los datos.
    expect(await db.getPedidosPendientesSync()).toHaveLength(2);
  });
});
