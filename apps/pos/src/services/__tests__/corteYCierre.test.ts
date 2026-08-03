import { describe, it, expect, beforeEach } from "vitest";
import { SQLiteLocalDB } from "../../db/impl/SQLiteLocalDB.js";
import { _setLocalDB, _resetLocalDB } from "../../db/db.js";
import {
  abrirDia,
  cerrarDia,
  getDiasSinCerrar,
  getEstadoCaja,
  DiasSinCerrarError,
} from "../cajaService.js";
import { armarCorte, SinAperturaError } from "../corte.js";
import { diaOperativo } from "../diaOperativo.js";
import {
  EstadoPedido,
  MetodoPago,
  OrigenPedido,
  TipoMovimientoCaja,
} from "@brasas/shared";
import type { PedidoLocal, AperturaLocal, MovimientoLocal } from "../../db/types.js";

// M1.9 — corte (lectura) separado del cierre (escritura). CONTEXT.md §7.7, RN-23 y RN-24.
//
// Fechas fijas en el pasado a propósito: `abrirDia` y los cortes de hoy usan
// `diaOperativo()`, que es la fecha real del reloj. Usando días de 2020 se garantiza que
// siempre queden ANTES de hoy, sin tener que congelar el tiempo.
const AYER = "2020-01-02";
const ANTEAYER = "2020-01-01";

let db: SQLiteLocalDB;

beforeEach(async () => {
  _resetLocalDB();
  db = new SQLiteLocalDB();
  await db.init();
  _setLocalDB(db);
});

function apertura(fecha: string, fondoInicial = 500): AperturaLocal {
  return {
    id: crypto.randomUUID(),
    fechaOperativa: fecha,
    fondoInicial,
    abiertoEn: `${fecha}T16:00:00.000Z`,
    sincronizado: false,
  };
}

function pedido(fecha: string, over: Partial<PedidoLocal> = {}): PedidoLocal {
  return {
    id: crypto.randomUUID(),
    folio: 1,
    fechaOperativa: fecha,
    catalogoVersion: 1,
    sucursalId: "suc-a",
    origen: OrigenPedido.MOSTRADOR,
    estado: EstadoPedido.ENTREGADO,
    metodoPago: MetodoPago.EFECTIVO,
    total: 300,
    creadoEn: `${fecha}T17:00:00.000Z`,
    actualizadoEn: `${fecha}T17:00:00.000Z`,
    items: [],
    sincronizado: false,
    ...over,
  };
}

function movimiento(fecha: string, over: Partial<MovimientoLocal> = {}): MovimientoLocal {
  return {
    id: crypto.randomUUID(),
    fechaOperativa: fecha,
    tipo: TipoMovimientoCaja.GASTO,
    concepto: "Hielo",
    monto: 50,
    creadoEn: `${fecha}T18:00:00.000Z`,
    sincronizado: false,
    eliminado: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
describe("RN-24 — días sin cerrar", () => {
  it("un día con apertura y sin cierre queda pendiente", async () => {
    await db.guardarApertura(apertura(AYER));

    const pendientes = await getDiasSinCerrar();
    expect(pendientes.map((a) => a.fechaOperativa)).toEqual([AYER]);
  });

  it("deja de estar pendiente en cuanto se cierra", async () => {
    await db.guardarApertura(apertura(AYER));
    await cerrarDia(crypto.randomUUID(), AYER);

    expect(await getDiasSinCerrar()).toHaveLength(0);
  });

  it("los lista del más viejo al más reciente", async () => {
    await db.guardarApertura(apertura(AYER));
    await db.guardarApertura(apertura(ANTEAYER));

    const pendientes = await getDiasSinCerrar();
    expect(pendientes.map((a) => a.fechaOperativa)).toEqual([ANTEAYER, AYER]);
  });

  it("el día en curso NO cuenta como pendiente", async () => {
    // Se pide lo pendiente ANTES de hoy: el turno abierto de hoy es lo normal, no un olvido.
    await db.guardarApertura(apertura(diaOperativo()));

    expect(await getDiasSinCerrar()).toHaveLength(0);
  });

  it("abrirDia se bloquea mientras haya un día anterior sin cerrar", async () => {
    await db.guardarApertura(apertura(AYER));

    await expect(abrirDia(crypto.randomUUID(), 500)).rejects.toBeInstanceOf(
      DiasSinCerrarError,
    );
    // Y no dejó una apertura a medias.
    expect(await db.getApertura(diaOperativo())).toBeNull();
  });

  it("el error dice qué días hay que cerrar", async () => {
    await db.guardarApertura(apertura(AYER));
    await db.guardarApertura(apertura(ANTEAYER));

    await expect(abrirDia(crypto.randomUUID(), 500)).rejects.toMatchObject({
      fechas: [ANTEAYER, AYER],
    });
  });

  it("cerrado lo pendiente, la apertura de hoy procede", async () => {
    await db.guardarApertura(apertura(AYER));
    await cerrarDia(crypto.randomUUID(), AYER);

    await abrirDia(crypto.randomUUID(), 700);
    expect((await db.getApertura(diaOperativo()))?.fondoInicial).toBe(700);
  });
});

// ---------------------------------------------------------------------------
describe("RN-23 — el corte es de solo lectura", () => {
  it("no cierra el día ni escribe nada", async () => {
    await db.guardarApertura(apertura(AYER));
    await db.guardarPedido(pedido(AYER));

    await armarCorte("Pradera Dorada", AYER);

    expect(await db.getCierre(AYER)).toBeNull();
    // El día sigue contando como pendiente: un corte no es un cierre.
    expect(await getDiasSinCerrar()).toHaveLength(1);
  });

  it("se puede emitir muchas veces y da lo mismo", async () => {
    await db.guardarApertura(apertura(AYER));
    await db.guardarPedido(pedido(AYER));

    const uno = await armarCorte("Pradera Dorada", AYER);
    const dos = await armarCorte("Pradera Dorada", AYER);

    expect(dos.totalVentas).toBe(uno.totalVentas);
    expect(dos.esperadoEnCaja).toBe(uno.esperadoEnCaja);
  });

  it("con el turno abierto sale marcado como parcial", async () => {
    await db.guardarApertura(apertura(AYER));

    const corte = await armarCorte("Pradera Dorada", AYER);
    expect(corte.parcial).toBe(true);
  });

  it("calcula el esperado en caja del momento", async () => {
    await db.guardarApertura(apertura(AYER, 500));
    await db.guardarPedido(pedido(AYER, { total: 300 }));
    await db.guardarMovimiento(movimiento(AYER, { monto: 50 })); // gasto

    const corte = await armarCorte("Pradera Dorada", AYER);

    // 500 fondo + 300 ventas en efectivo - 50 de gasto
    expect(corte.esperadoEnCaja).toBe(750);
    expect(corte.ventasEfectivo).toBe(300);
    expect(corte.gastos).toEqual([{ concepto: "Hielo", monto: 50 }]);
  });

  it("refleja las ventas que entraron después del corte anterior", async () => {
    await db.guardarApertura(apertura(AYER, 500));
    await db.guardarPedido(pedido(AYER, { total: 300 }));

    const antes = await armarCorte("Pradera Dorada", AYER);
    await db.guardarPedido(pedido(AYER, { folio: 2, total: 200 }));
    const despues = await armarCorte("Pradera Dorada", AYER);

    expect(antes.totalVentas).toBe(300);
    expect(despues.totalVentas).toBe(500);
  });

  it("un día sin apertura no tiene corte que generar", async () => {
    await expect(armarCorte("Pradera Dorada", AYER)).rejects.toBeInstanceOf(
      SinAperturaError,
    );
  });

  it("los pedidos cancelados salen listados pero no suman", async () => {
    await db.guardarApertura(apertura(AYER, 0));
    await db.guardarPedido(pedido(AYER, { folio: 1, total: 300 }));
    await db.guardarPedido(
      pedido(AYER, { folio: 2, total: 999, estado: EstadoPedido.CANCELADO }),
    );

    const corte = await armarCorte("Pradera Dorada", AYER);

    expect(corte.totalVentas).toBe(300);
    expect(corte.pedidos).toHaveLength(2);
    expect(corte.pedidos.find((p) => p.folio === 2)?.cancelado).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe("Cierre de un día pasado", () => {
  it("cierra la fecha que se le pide, no la de hoy", async () => {
    await db.guardarApertura(apertura(AYER));

    const cierre = await cerrarDia(crypto.randomUUID(), AYER);

    expect(cierre.fechaOperativa).toBe(AYER);
    expect(await db.getCierre(AYER)).not.toBeNull();
    expect(await db.getCierre(diaOperativo())).toBeNull();
  });

  it("congela los números del día que cierra", async () => {
    await db.guardarApertura(apertura(AYER, 500));
    await db.guardarPedido(pedido(AYER, { total: 300 }));
    await db.guardarMovimiento(movimiento(AYER, { monto: 50 }));

    const cierre = await cerrarDia(crypto.randomUUID(), AYER);

    expect(cierre.fondoInicial).toBe(500);
    expect(cierre.ventasEfectivo).toBe(300);
    expect(cierre.totalGastos).toBe(50);
    expect(cierre.esperadoEnCaja).toBe(750);
  });

  it("no se puede cerrar dos veces", async () => {
    await db.guardarApertura(apertura(AYER));
    await cerrarDia(crypto.randomUUID(), AYER);

    await expect(cerrarDia(crypto.randomUUID(), AYER)).rejects.toThrow(/ya está cerrado/);
  });

  it("no se puede cerrar un día que nunca se abrió", async () => {
    await expect(cerrarDia(crypto.randomUUID(), AYER)).rejects.toThrow(/No hay apertura/);
  });

  it("tras cerrar, el corte reproduce el snapshot y ya no es parcial", async () => {
    await db.guardarApertura(apertura(AYER, 500));
    await db.guardarPedido(pedido(AYER, { total: 300 }));
    await cerrarDia(crypto.randomUUID(), AYER, "sin novedad");

    const corte = await armarCorte("Pradera Dorada", AYER);

    expect(corte.parcial).toBeUndefined();
    expect(corte.esperadoEnCaja).toBe(800);
    expect(corte.notas).toBe("sin novedad");
  });

  it("un pedido rezagado NO altera el corte ya cerrado", async () => {
    // El ticket que el encargado tiene en la mano debe poder reimprimirse idéntico.
    await db.guardarApertura(apertura(AYER, 500));
    await db.guardarPedido(pedido(AYER, { total: 300 }));
    await cerrarDia(crypto.randomUUID(), AYER);

    await db.guardarPedido(pedido(AYER, { folio: 2, total: 200 }));

    const corte = await armarCorte("Pradera Dorada", AYER);
    expect(corte.totalVentas).toBe(300);
    expect(corte.esperadoEnCaja).toBe(800);
  });

  it("el cierre y el corte previo coinciden en el esperado", async () => {
    // Si el corte de control y el cierre pudieran diferir, ninguno serviría para confiar
    // en la caja. Es la razón de que compartan la fórmula de @brasas/shared.
    await db.guardarApertura(apertura(AYER, 500));
    await db.guardarPedido(pedido(AYER, { total: 300 }));
    await db.guardarMovimiento(movimiento(AYER, { monto: 50 }));

    const corteParcial = await armarCorte("Pradera Dorada", AYER);
    const cierre = await cerrarDia(crypto.randomUUID(), AYER);

    expect(cierre.esperadoEnCaja).toBe(corteParcial.esperadoEnCaja);
    expect(cierre.totalVentas).toBe(corteParcial.totalVentas);
  });

  it("el estado de caja del día cerrado lo muestra cerrado", async () => {
    await db.guardarApertura(apertura(AYER));
    await cerrarDia(crypto.randomUUID(), AYER);

    const estado = await getEstadoCaja(AYER);
    expect(estado.cierre).not.toBeNull();
    expect(estado.apertura).not.toBeNull();
  });
});
