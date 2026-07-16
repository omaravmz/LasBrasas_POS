import { describe, it, expect } from "vitest";
import { SQLiteLocalDB } from "../impl/SQLiteLocalDB.js";
import type { CategoriaLocal, ProductoLocal, PedidoLocal } from "../types.js";
import { EstadoPedido, MetodoPago, OrigenPedido } from "@brasas/shared";

// En Node (entorno de test), OPFS no existe: la DB opera en memoria.
// Cada test crea su propia instancia con initDB(), así que arrancan aislados.

function makeDB(): SQLiteLocalDB {
  return new SQLiteLocalDB();
}

async function initDB(): Promise<SQLiteLocalDB> {
  const db = makeDB();
  await db.init();
  return db;
}

// Fixtures reutilizables
const cat1: CategoriaLocal = { id: "cat-1", nombre: "Carne Asada", orden: 1 };
const cat2: CategoriaLocal = { id: "cat-2", nombre: "Pollos", orden: 2 };

const prod1: ProductoLocal = {
  id: "prod-1", categoriaId: "cat-1", nombre: "Individual",
  precio: 0, activo: true, requiereCorte: true, gramosBase: 180, orden: 1,
  variantes: [{ id: "v1", nombre: "Sirloin", grupoCorteId: "grupo-corte-1", activo: true }],
  preciosPorGrupo: [
    { grupoCorteId: "grupo-corte-1", precio: 130 },
    { grupoCorteId: "grupo-corte-2", precio: 155 },
  ],
};
const prod2: ProductoLocal = {
  id: "prod-2", categoriaId: "cat-2", nombre: "¼ Pollo",
  precio: 85, activo: true, requiereCorte: false, orden: 2,
  variantes: [],
  preciosPorGrupo: [],
};

const HOY = "2026-06-15";

function makePedido(overrides: Partial<PedidoLocal> = {}): PedidoLocal {
  return {
    id: "ped-001",
    folio: 1,
    fechaOperativa: HOY,
    catalogoVersion: 1,
    sucursalId: "suc-a",
    origen: OrigenPedido.MOSTRADOR,
    estado: EstadoPedido.PENDIENTE,
    metodoPago: MetodoPago.EFECTIVO,
    total: 130,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    items: [{
      id: "item-1", productoId: "prod-1", cantidad: 1, precioUnitario: 130,
      selecciones: [{ id: "sel-1", varianteId: "v1", proporcion: 1 }],
    }],
    sincronizado: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
describe("Config", () => {
  it("getConfig retorna null si la clave no existe", async () => {
    const db = await initDB();
    expect(await db.getConfig("inexistente")).toBeNull();
  });

  it("setConfig y getConfig roundtrip", async () => {
    const db = await initDB();
    await db.setConfig("folio_dia", '{"fecha":"2026-06-15","ultimo":5}');
    const raw = await db.getConfig("folio_dia");
    expect(raw).toBe('{"fecha":"2026-06-15","ultimo":5}');
  });

  it("setConfig sobreescribe el valor existente", async () => {
    const db = await initDB();
    await db.setConfig("clave", "valor1");
    await db.setConfig("clave", "valor2");
    expect(await db.getConfig("clave")).toBe("valor2");
  });

  it("múltiples claves coexisten sin interferencia", async () => {
    const db = await initDB();
    await db.setConfig("a", "1");
    await db.setConfig("b", "2");
    expect(await db.getConfig("a")).toBe("1");
    expect(await db.getConfig("b")).toBe("2");
  });
});

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
describe("Catálogo", () => {
  it("getCategorias retorna vacío en DB nueva", async () => {
    const db = await initDB();
    expect(await db.getCategorias()).toEqual([]);
  });

  it("getProductos retorna vacío en DB nueva", async () => {
    const db = await initDB();
    expect(await db.getProductos()).toEqual([]);
  });

  it("guardarCatalogo persiste categorías ordenadas", async () => {
    const db = await initDB();
    await db.guardarCatalogo([cat2, cat1], []);
    const cats = await db.getCategorias();
    expect(cats).toHaveLength(2);
    expect(cats[0]!.id).toBe("cat-1"); // orden 1 primero
    expect(cats[1]!.id).toBe("cat-2");
  });

  it("guardarCatalogo persiste productos con variantes en JSON", async () => {
    const db = await initDB();
    await db.guardarCatalogo([cat1, cat2], [prod1, prod2]);
    const prods = await db.getProductos();
    expect(prods).toHaveLength(2);
    expect(prods[0]!.id).toBe("prod-1");
    expect(prods[0]!.variantes).toHaveLength(1);
    expect(prods[0]!.variantes[0]!.nombre).toBe("Sirloin");
  });

  it("guardarCatalogo reemplaza completamente el catálogo anterior", async () => {
    const db = await initDB();
    await db.guardarCatalogo([cat1], [prod1]);
    // Segunda sync con catálogo reducido
    await db.guardarCatalogo([cat2], [prod2]);
    const cats = await db.getCategorias();
    const prods = await db.getProductos();
    expect(cats).toHaveLength(1);
    expect(cats[0]!.id).toBe("cat-2");
    expect(prods).toHaveLength(1);
    expect(prods[0]!.id).toBe("prod-2");
  });

  it("getProductos respeta el orden del campo orden", async () => {
    const db = await initDB();
    // Insertamos en orden inverso
    await db.guardarCatalogo([cat1, cat2], [prod2, prod1]);
    const prods = await db.getProductos();
    expect(prods[0]!.id).toBe("prod-1"); // orden 1 primero
    expect(prods[1]!.id).toBe("prod-2");
  });
});

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------
describe("Pedidos", () => {
  it("getPedidosPendientesSync retorna vacío en DB nueva", async () => {
    const db = await initDB();
    expect(await db.getPedidosPendientesSync()).toEqual([]);
  });

  it("guardarPedido persiste el pedido con todos sus campos", async () => {
    const db = await initDB();
    const pedido = makePedido();
    await db.guardarPedido(pedido);
    const pendientes = await db.getPedidosPendientesSync();
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]!.id).toBe("ped-001");
    expect(pendientes[0]!.folio).toBe(1);
    expect(pendientes[0]!.total).toBe(130);
    expect(pendientes[0]!.items).toHaveLength(1);
    expect(pendientes[0]!.items[0]!.selecciones).toHaveLength(1);
  });

  it("getPedidosPendientesSync no devuelve pedidos ya sincronizados", async () => {
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "ped-pendiente", sincronizado: false }));
    await db.guardarPedido(makePedido({ id: "ped-sync", folio: 2, sincronizado: true }));
    const pendientes = await db.getPedidosPendientesSync();
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]!.id).toBe("ped-pendiente");
  });

  it("marcarSincronizados actualiza el flag en el registro", async () => {
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "p1" }));
    await db.guardarPedido(makePedido({ id: "p2", folio: 2 }));
    await db.marcarSincronizados(["p1"]);
    const pendientes = await db.getPedidosPendientesSync();
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]!.id).toBe("p2");
  });

  it("marcarSincronizados con array vacío no lanza error", async () => {
    const db = await initDB();
    await expect(db.marcarSincronizados([])).resolves.toBeUndefined();
  });

  it("marcarSincronizados de un id inexistente no lanza error", async () => {
    const db = await initDB();
    await expect(db.marcarSincronizados(["no-existe"])).resolves.toBeUndefined();
  });

  it("guardarPedido sobre un id existente lo sobreescribe (upsert)", async () => {
    const db = await initDB();
    const pedido = makePedido({ total: 100 });
    await db.guardarPedido(pedido);
    await db.guardarPedido({ ...pedido, total: 200 });
    const pendientes = await db.getPedidosPendientesSync();
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]!.total).toBe(200);
  });

  it("múltiples pedidos pendientes se devuelven todos", async () => {
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "p1", folio: 1 }));
    await db.guardarPedido(makePedido({ id: "p2", folio: 2 }));
    await db.guardarPedido(makePedido({ id: "p3", folio: 3 }));
    expect(await db.getPedidosPendientesSync()).toHaveLength(3);
  });

  it("marcarSincronizados actualiza el JSON interno (campo sincronizado: true)", async () => {
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "p1" }));
    await db.marcarSincronizados(["p1"]);
    // Después de marcar, no debe aparecer en pendientes
    const pendientes = await db.getPedidosPendientesSync();
    expect(pendientes.find((p) => p.id === "p1")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Folio derivado de los datos (BD-03)
// ---------------------------------------------------------------------------
describe("getMaxFolio", () => {
  it("devuelve 0 cuando no hay pedidos ese día", async () => {
    const db = await initDB();
    expect(await db.getMaxFolio(HOY)).toBe(0);
  });

  it("devuelve el folio más alto del día", async () => {
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "p1", folio: 1 }));
    await db.guardarPedido(makePedido({ id: "p2", folio: 2 }));
    await db.guardarPedido(makePedido({ id: "p3", folio: 3 }));

    expect(await db.getMaxFolio(HOY)).toBe(3);
  });

  it("cuenta también los pedidos ya sincronizados", async () => {
    // Un pedido sincronizado sigue habiendo consumido su folio: si lo ignoráramos,
    // el contador retrocedería en cuanto la cola se vaciara.
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "p1", folio: 7, sincronizado: true }));

    expect(await db.getMaxFolio(HOY)).toBe(7);
  });

  it("los folios de otro día no interfieren", async () => {
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "ayer", folio: 42, fechaOperativa: "2026-06-14" }));
    await db.guardarPedido(makePedido({ id: "hoy", folio: 1, fechaOperativa: HOY }));

    expect(await db.getMaxFolio(HOY)).toBe(1);
    expect(await db.getMaxFolio("2026-06-14")).toBe(42);
  });

  it("borrar la config NO reinicia el contador", async () => {
    // Este es el fallo que YA OCURRIÓ en producción de desarrollo: el contador vivía en
    // una clave de config, se borró el storage, volvió a 1 y se emitieron folios
    // duplicados en silencio. Ahora el folio sale de los pedidos: mientras los pedidos
    // estén, el contador no puede retroceder.
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "p1", folio: 4 }));

    await db.setConfig("folio_dia", "");
    await db.setConfig("cualquier_otra_cosa", "");

    expect(await db.getMaxFolio(HOY)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Cola de sincronización: FIFO y sin descartes (BD-05 / §1)
// ---------------------------------------------------------------------------
describe("Cola de sincronización", () => {
  it("devuelve los pendientes en orden cronológico", async () => {
    // El orden no es cosmético: la cola se drena en FIFO y una operación que falla
    // bloquea a las que dependen de ella.
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "tercero", folio: 3, creadoEn: "2026-06-15T18:00:00.000Z" }));
    await db.guardarPedido(makePedido({ id: "primero", folio: 1, creadoEn: "2026-06-15T16:00:00.000Z" }));
    await db.guardarPedido(makePedido({ id: "segundo", folio: 2, creadoEn: "2026-06-15T17:00:00.000Z" }));

    const cola = await db.getPedidosPendientesSync();

    expect(cola.map((p) => p.id)).toEqual(["primero", "segundo", "tercero"]);
  });

  it("un pedido con error definitivo sale de la cola pero NO se borra", async () => {
    // La venta ocurrió y el dinero está en el cajón: perder el registro es peor que
    // cualquier error de sincronización.
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "roto", folio: 1 }));

    await db.marcarErrorSync("roto", "FOLIO_DUPLICADO: ya existe otro pedido con ese folio");

    expect(await db.getPedidosPendientesSync()).toHaveLength(0);

    const conError = await db.getPedidosConError();
    expect(conError).toHaveLength(1);
    expect(conError[0]!.id).toBe("roto");
    expect(conError[0]!.errorSync).toContain("FOLIO_DUPLICADO");
    expect(conError[0]!.total).toBe(130);
  });

  it("un pedido con error no bloquea a los siguientes", async () => {
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "roto", folio: 1, creadoEn: "2026-06-15T16:00:00.000Z" }));
    await db.guardarPedido(makePedido({ id: "sano", folio: 2, creadoEn: "2026-06-15T17:00:00.000Z" }));

    await db.marcarErrorSync("roto", "FOLIO_DUPLICADO: colisión");

    const cola = await db.getPedidosPendientesSync();
    expect(cola.map((p) => p.id)).toEqual(["sano"]);
  });

  it("un pedido con error sigue contando para el folio", async () => {
    // Aunque el servidor lo haya rechazado, el ticket se imprimió con ese folio.
    // Reutilizarlo produciría dos tickets con el mismo número.
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "roto", folio: 5 }));
    await db.marcarErrorSync("roto", "FOLIO_DUPLICADO");

    expect(await db.getMaxFolio(HOY)).toBe(5);
  });

  it("sincronizar un pedido limpia su error previo", async () => {
    const db = await initDB();
    await db.guardarPedido(makePedido({ id: "p1" }));
    await db.marcarErrorSync("p1", "DIA_NO_ABIERTO");
    await db.marcarSincronizados(["p1"]);

    expect(await db.getPedidosConError()).toHaveLength(0);
    expect(await db.getPedidosPendientesSync()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integración: flujo completo de venta offline
// ---------------------------------------------------------------------------
describe("Flujo completo offline", () => {
  it("venta offline → sync → estado correcto", async () => {
    const db = await initDB();

    // 1. Guardar catálogo (simula catalogSync)
    await db.guardarCatalogo([cat1], [prod1]);
    await db.setConfig("sucursal_id", "suc-a");
    await db.setConfig("folio_dia", '{"fecha":"2026-06-15","ultimo":0}');

    // 2. Registrar pedido offline
    const pedido = makePedido({ id: "offline-001", folio: 1 });
    await db.guardarPedido(pedido);

    // Verificar que está pendiente
    expect(await db.getPedidosPendientesSync()).toHaveLength(1);

    // 3. Simular reconexión y sync exitosa
    await db.marcarSincronizados(["offline-001"]);

    // Verificar que ya no está pendiente
    expect(await db.getPedidosPendientesSync()).toHaveLength(0);

    // Config intacta
    expect(await db.getConfig("sucursal_id")).toBe("suc-a");
  });
});
