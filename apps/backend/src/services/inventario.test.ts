import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "../middleware/errorHandler.js";
import type { MovimientoInput } from "./inventario.js";

// El servicio usa el singleton `prisma` para saldoSegunLedger/auditarSaldos. Lo redirigimos
// al MISMO fake que pasamos como TransactionClient a las demás funciones, para que asiento
// y auditoría compartan estado.
vi.mock("../lib/prisma.js", async () => {
  const { fakePrisma } = await import("./__fixtures__/fakePrisma.js");
  return { prisma: fakePrisma as unknown as PrismaClient };
});

import {
  asentarMovimientos,
  revertirMovimientos,
  saldoSegunLedger,
  auditarSaldos,
  validarTransformacion,
} from "./inventario.js";
import { fakePrisma } from "./__fixtures__/fakePrisma.js";

// El fake también hace de TransactionClient (asentarMovimientos exige que se le llame
// dentro de una transacción del llamador; aquí ese "tx" es nuestro fake).
const tx = fakePrisma as unknown as Prisma.TransactionClient;

const SUC_A = "sucursal-a";
const SUC_B = "sucursal-b";
const CARNE = "insumo-carne";
const TORTILLAS = "insumo-tortillas";
const FECHA = "2026-07-15";

function mov(over: Partial<MovimientoInput> = {}): MovimientoInput {
  return {
    sucursalId: SUC_A,
    insumoId: CARNE,
    cantidad: 100,
    tipo: "ENTRADA",
    refTipo: "ENTRADA_INVENTARIO",
    refId: crypto.randomUUID(),
    fechaOperativa: FECHA,
    ...over,
  };
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
    return undefined;
  } catch (err) {
    return err instanceof AppError ? err.code : "NO_APP_ERROR";
  }
}

beforeEach(() => {
  fakePrisma.reset();
});

// ---------------------------------------------------------------------------
// asentarMovimientos
// ---------------------------------------------------------------------------

describe("asentarMovimientos", () => {
  it("no hace nada con una lista vacía", async () => {
    await asentarMovimientos(tx, []);
    expect(fakePrisma.movimientosStore).toHaveLength(0);
    expect(fakePrisma.saldosStore).toHaveLength(0);
  });

  it("rechaza un movimiento de cantidad cero", async () => {
    const code = await codigoDe(() => asentarMovimientos(tx, [mov({ cantidad: 0 })]));
    expect(code).toBe("VALIDATION_ERROR");
    // No asentó nada.
    expect(fakePrisma.movimientosStore).toHaveLength(0);
  });

  it("una ENTRADA crea el saldo si no existía y asienta el ledger", async () => {
    await asentarMovimientos(tx, [mov({ cantidad: 100 })]);

    expect(fakePrisma.movimientosStore).toHaveLength(1);
    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(100);
  });

  it("dos ENTRADAS incrementan el saldo", async () => {
    await asentarMovimientos(tx, [mov({ cantidad: 100 })]);
    await asentarMovimientos(tx, [mov({ cantidad: 250 })]);

    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(350);
    expect(fakePrisma.movimientosStore).toHaveLength(2);
  });

  it("una VENTA con saldo suficiente lo descuenta", async () => {
    fakePrisma.seedSaldo(SUC_A, CARNE, 500);

    await asentarMovimientos(tx, [
      mov({ cantidad: -300, tipo: "VENTA", refTipo: "PEDIDO" }),
    ]);

    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(200);
  });

  it("una VENTA sin saldo suficiente falla y NO asienta nada (RN-11)", async () => {
    fakePrisma.seedSaldo(SUC_A, CARNE, 100);
    fakePrisma.seedInsumo({ id: CARNE, nombre: "Carne Diezmillo", unidadBase: "GR" });

    const code = await codigoDe(() =>
      asentarMovimientos(tx, [mov({ cantidad: -300, tipo: "VENTA", refTipo: "PEDIDO" })]),
    );

    expect(code).toBe("INVENTARIO_INSUFICIENTE");
    // Todo o nada: ni el ledger ni el saldo se tocaron.
    expect(fakePrisma.movimientosStore).toHaveLength(0);
    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(100);
  });

  it("es todo-o-nada entre insumos: si uno no alcanza, ninguno se asienta", async () => {
    fakePrisma.seedSaldo(SUC_A, CARNE, 500); // suficiente
    fakePrisma.seedSaldo(SUC_A, TORTILLAS, 100); // insuficiente
    fakePrisma.seedInsumo({ id: TORTILLAS, nombre: "Tortillas", unidadBase: "GR" });

    const refId = crypto.randomUUID();
    const code = await codigoDe(() =>
      asentarMovimientos(tx, [
        mov({ cantidad: -300, tipo: "VENTA", refTipo: "PEDIDO", refId }),
        mov({ insumoId: TORTILLAS, cantidad: -250, tipo: "VENTA", refTipo: "PEDIDO", refId }),
      ]),
    );

    expect(code).toBe("INVENTARIO_INSUFICIENTE");
    expect(fakePrisma.movimientosStore).toHaveLength(0);
    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(500);
    expect(fakePrisma.saldoDe(SUC_A, TORTILLAS)?.toNumber()).toBe(100);
  });

  it("es idempotente: reasentar el mismo movimiento no duplica el efecto (RN-18)", async () => {
    const m = mov({ cantidad: 100 });

    await asentarMovimientos(tx, [m]);
    await asentarMovimientos(tx, [m]); // reenvío (sync offline)

    expect(fakePrisma.movimientosStore).toHaveLength(1);
    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(100);
  });

  it("netea varios movimientos del mismo insumo en un solo delta de saldo", async () => {
    fakePrisma.seedSaldo(SUC_A, CARNE, 0);
    const refId = crypto.randomUUID();

    // Una entrada y una salida del mismo insumo en la misma operación: net +20.
    await asentarMovimientos(tx, [
      mov({ cantidad: 100, tipo: "ENTRADA", refId }),
      mov({ cantidad: -80, tipo: "VENTA", refTipo: "ENTRADA_INVENTARIO", refId }),
    ]);

    expect(fakePrisma.movimientosStore).toHaveLength(2);
    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(20);
  });

  it("comprueba la suficiencia sobre el NETO, no movimiento por movimiento", async () => {
    fakePrisma.seedSaldo(SUC_A, CARNE, 0);
    fakePrisma.seedInsumo({ id: CARNE, nombre: "Carne", unidadBase: "GR" });
    const refId = crypto.randomUUID();

    // +100 y -150 → net -50 sobre un saldo de 0 → insuficiente.
    const code = await codigoDe(() =>
      asentarMovimientos(tx, [
        mov({ cantidad: 100, tipo: "ENTRADA", refId }),
        mov({ cantidad: -150, tipo: "VENTA", refTipo: "ENTRADA_INVENTARIO", refId }),
      ]),
    );

    expect(code).toBe("INVENTARIO_INSUFICIENTE");
    expect(fakePrisma.movimientosStore).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// revertirMovimientos (RN-05)
// ---------------------------------------------------------------------------

describe("revertirMovimientos", () => {
  it("asienta el opuesto EXACTO de lo que la venta descontó", async () => {
    fakePrisma.seedSaldo(SUC_A, CARNE, 500);
    const refId = crypto.randomUUID();

    await asentarMovimientos(tx, [
      mov({ cantidad: -300, tipo: "VENTA", refTipo: "PEDIDO", refId }),
    ]);
    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(200);

    await revertirMovimientos(tx, "PEDIDO", refId, "CANCELACION", FECHA);

    // El saldo vuelve a lo que era; se asienta un movimiento de CANCELACION.
    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(500);
    const cancelaciones = fakePrisma.movimientosStore.filter((m) => m.tipo === "CANCELACION");
    expect(cancelaciones).toHaveLength(1);
    expect(cancelaciones[0]!.cantidad.toNumber()).toBe(300);
  });

  it("no hace nada si no hay movimientos que revertir", async () => {
    await revertirMovimientos(tx, "PEDIDO", crypto.randomUUID(), "CANCELACION", FECHA);
    expect(fakePrisma.movimientosStore).toHaveLength(0);
  });

  it("no revierte dos veces: la segunda cancelación es idempotente", async () => {
    fakePrisma.seedSaldo(SUC_A, CARNE, 500);
    const refId = crypto.randomUUID();

    await asentarMovimientos(tx, [
      mov({ cantidad: -300, tipo: "VENTA", refTipo: "PEDIDO", refId }),
    ]);

    await revertirMovimientos(tx, "PEDIDO", refId, "CANCELACION", FECHA);
    await revertirMovimientos(tx, "PEDIDO", refId, "CANCELACION", FECHA); // reintento

    // Sigue habiendo una sola CANCELACION; el saldo no se acredita dos veces.
    const cancelaciones = fakePrisma.movimientosStore.filter((m) => m.tipo === "CANCELACION");
    expect(cancelaciones).toHaveLength(1);
    expect(fakePrisma.saldoDe(SUC_A, CARNE)?.toNumber()).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// saldoSegunLedger y auditarSaldos
// ---------------------------------------------------------------------------

describe("saldoSegunLedger", () => {
  it("suma el ledger del insumo", async () => {
    fakePrisma.seedMovimiento({
      sucursalId: SUC_A, insumoId: CARNE, cantidad: new Prisma.Decimal(100),
      tipo: "ENTRADA", refTipo: "ENTRADA_INVENTARIO", refId: crypto.randomUUID(),
      fechaOperativa: new Date(`${FECHA}T00:00:00.000Z`), notas: null,
    });
    fakePrisma.seedMovimiento({
      sucursalId: SUC_A, insumoId: CARNE, cantidad: new Prisma.Decimal(-30),
      tipo: "VENTA", refTipo: "PEDIDO", refId: crypto.randomUUID(),
      fechaOperativa: new Date(`${FECHA}T00:00:00.000Z`), notas: null,
    });

    const saldo = await saldoSegunLedger(SUC_A, CARNE);
    expect(saldo.toNumber()).toBe(70);
  });

  it("devuelve cero cuando el insumo no tiene movimientos", async () => {
    const saldo = await saldoSegunLedger(SUC_A, CARNE);
    expect(saldo.toNumber()).toBe(0);
  });
});

describe("auditarSaldos", () => {
  it("no reporta descuadres cuando el saldo coincide con su ledger", async () => {
    fakePrisma.seedInsumo({ id: CARNE, nombre: "Carne", unidadBase: "GR" });
    await asentarMovimientos(tx, [mov({ cantidad: 100 })]);

    const descuadres = await auditarSaldos();
    expect(descuadres).toEqual([]);
  });

  it("detecta un saldo materializado que se desvió de su ledger", async () => {
    fakePrisma.seedInsumo({ id: CARNE, nombre: "Carne Diezmillo", unidadBase: "GR" });
    // Saldo dice 999, pero el ledger solo respalda 100.
    fakePrisma.seedSaldo(SUC_A, CARNE, 999);
    fakePrisma.seedMovimiento({
      sucursalId: SUC_A, insumoId: CARNE, cantidad: new Prisma.Decimal(100),
      tipo: "ENTRADA", refTipo: "ENTRADA_INVENTARIO", refId: crypto.randomUUID(),
      fechaOperativa: new Date(`${FECHA}T00:00:00.000Z`), notas: null,
    });

    const descuadres = await auditarSaldos();
    expect(descuadres).toHaveLength(1);
    expect(descuadres[0]!.insumo).toBe("Carne Diezmillo");
    expect(descuadres[0]!.saldoMaterializado).toBe("999.000");
    expect(descuadres[0]!.saldoLedger).toBe("100.000");
  });
});

// ---------------------------------------------------------------------------
// validarTransformacion (RN-06)
// ---------------------------------------------------------------------------

describe("validarTransformacion", () => {
  const POLLO_CRUDO = "insumo-pollo-crudo";
  const POLLO_ASADO = "insumo-pollo-asado";

  it("devuelve el factor cuando la transformación está permitida en la sucursal", async () => {
    fakePrisma.seedPermitida({
      insumoOrigenId: POLLO_CRUDO, insumoDestinoId: POLLO_ASADO,
      sucursalId: SUC_B, factor: new Prisma.Decimal(1), activo: true,
    });

    const factor = await validarTransformacion(tx, SUC_B, POLLO_CRUDO, POLLO_ASADO);
    expect(factor.toNumber()).toBe(1);
  });

  it("acepta una transformación global (sucursalId null) en cualquier sucursal", async () => {
    fakePrisma.seedPermitida({
      insumoOrigenId: POLLO_CRUDO, insumoDestinoId: POLLO_ASADO,
      sucursalId: null, factor: new Prisma.Decimal(2), activo: true,
    });

    const factor = await validarTransformacion(tx, SUC_A, POLLO_CRUDO, POLLO_ASADO);
    expect(factor.toNumber()).toBe(2);
  });

  it("rechaza una transformación permitida en OTRA sucursal (RN-06: solo Sucursal B)", async () => {
    fakePrisma.seedPermitida({
      insumoOrigenId: POLLO_CRUDO, insumoDestinoId: POLLO_ASADO,
      sucursalId: SUC_B, factor: new Prisma.Decimal(1), activo: true,
    });

    const code = await codigoDe(() =>
      validarTransformacion(tx, SUC_A, POLLO_CRUDO, POLLO_ASADO),
    );
    expect(code).toBe("TRANSFORMACION_NO_PERMITIDA");
  });

  it("rechaza una transformación inactiva", async () => {
    fakePrisma.seedPermitida({
      insumoOrigenId: POLLO_CRUDO, insumoDestinoId: POLLO_ASADO,
      sucursalId: SUC_B, factor: new Prisma.Decimal(1), activo: false,
    });

    const code = await codigoDe(() =>
      validarTransformacion(tx, SUC_B, POLLO_CRUDO, POLLO_ASADO),
    );
    expect(code).toBe("TRANSFORMACION_NO_PERMITIDA");
  });

  it("rechaza una transformación que no existe", async () => {
    const code = await codigoDe(() =>
      validarTransformacion(tx, SUC_B, POLLO_CRUDO, POLLO_ASADO),
    );
    expect(code).toBe("TRANSFORMACION_NO_PERMITIDA");
  });
});
