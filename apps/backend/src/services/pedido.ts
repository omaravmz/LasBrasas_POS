import { Prisma } from "@prisma/client";
import { CodigoError } from "@brasas/shared";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { obtenerCatalogoVersion } from "./catalogo.js";
import {
  resolverPrecios,
  validarAritmetica,
  type LineaPedido,
  type ProductoCatalogo,
  type VarianteCatalogo,
} from "./pedidoValidacion.js";
import type { Decimal } from "@prisma/client/runtime/library.js";
import type { EstadoPedido, MetodoPago, OrigenPedido, Pedido } from "@prisma/client";

// Transiciones de estado permitidas, por origen del pedido.
//
// En MOSTRADOR el cliente espera y se lleva el pedido en el momento: no hay una
// etapa intermedia de "listo para recoger", así que PENDIENTE -> ENTREGADO es
// válido. Los pedidos a distancia (TELEFONO, WHATSAPP, DELIVERY) sí pasan por
// LISTO antes de salir.
const REMOTO: Partial<Record<EstadoPedido, EstadoPedido[]>> = {
  PENDIENTE: ["LISTO", "CANCELADO"],
  LISTO: ["ENTREGADO", "CANCELADO"],
};

const TRANSICIONES: Record<OrigenPedido, Partial<Record<EstadoPedido, EstadoPedido[]>>> = {
  MOSTRADOR: {
    PENDIENTE: ["LISTO", "ENTREGADO", "CANCELADO"],
    LISTO: ["ENTREGADO", "CANCELADO"],
  },
  TELEFONO: REMOTO,
  WHATSAPP: REMOTO,
  DELIVERY: REMOTO,
};

export function esTransicionValida(
  origen: OrigenPedido,
  actual: EstadoPedido,
  nuevo: EstadoPedido,
): boolean {
  return (TRANSICIONES[origen][actual] ?? []).includes(nuevo);
}

// Nombres de los índices únicos, tal como los crea Postgres. Se usan para distinguir
// QUÉ colisionó cuando Prisma lanza P2002: la misma excepción significa cosas muy
// distintas según el índice.
const INDICE_PK = "Pedido_pkey";
const INDICE_FOLIO = "Pedido_sucursalId_fechaOperativa_folio_key";

export interface SeleccionInput {
  id: string;
  varianteId: string;
  proporcion: number;
}

export interface ItemPedidoInput {
  id: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  notas?: string;
  selecciones: SeleccionInput[];
}

export interface CrearPedidoInput {
  id: string;
  folio: number;
  // Día de operación, estampado por la TERMINAL en el momento del cobro. "YYYY-MM-DD".
  fechaOperativa: string;
  // Versión del catálogo con la que la terminal cotizó este pedido.
  catalogoVersion: number;
  sucursalId: string;
  dispositivoId?: string;
  clienteId?: string;
  origen: OrigenPedido;
  metodoPago: MetodoPago;
  total: number;
  notas?: string;
  horaRecoleccion?: string;
  items: ItemPedidoInput[];
}

export interface CancelarPedidoInput {
  id: string;
  metodoPago: MetodoPago | null;
  total: Decimal;
}

export async function cancelarPedido(input: CancelarPedidoInput): Promise<Pedido> {
  const estabaCobrado = input.metodoPago !== null;

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.pedido.update({
      where: { id: input.id },
      data: {
        estado: "CANCELADO",
        ...(estabaCobrado && {
          reembolsado: true,
          montoReembolso: input.total,
          fechaReembolso: new Date(),
        }),
      },
    });

    // Punto de extensión M2.2: revertir descuento de inventario por receta
    // await revertirInventarioPorPedido(tx, input.id);

    return actualizado;
  });
}

// Convierte "YYYY-MM-DD" al Date que espera una columna @db.Date de Prisma.
function fechaDate(fecha: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new AppError("VALIDATION_ERROR", `fechaOperativa inválida: ${fecha}`, 400);
  }

  const d = new Date(`${fecha}T00:00:00.000Z`);

  if (Number.isNaN(d.getTime())) {
    throw new AppError("VALIDATION_ERROR", `fechaOperativa inválida: ${fecha}`, 400);
  }

  return d;
}

// ---------------------------------------------------------------------------
// Validación del día de operación (BD-02)
//
// La fechaOperativa la estampa la terminal; el servidor NO la deriva. Aquí solo se
// comprueba que apunte a un día real y utilizable.
// ---------------------------------------------------------------------------
async function validarDiaOperativo(sucursalId: string, fecha: Date): Promise<void> {
  const [apertura, cierre] = await Promise.all([
    prisma.aperturaDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha } },
      select: { id: true },
    }),
    prisma.cierreDia.findUnique({
      where: { sucursalId_fecha: { sucursalId, fecha } },
      select: { id: true },
    }),
  ]);

  if (!apertura) {
    // Normalmente esto significa que la apertura todavía no ha sincronizado. La cola
    // del POS es FIFO, así que basta con reintentar: la apertura va delante.
    throw new AppError(
      CodigoError.DIA_NO_ABIERTO,
      "No existe apertura de caja para el día de operación del pedido",
      422,
      { fechaOperativa: fecha.toISOString().slice(0, 10) },
    );
  }

  if (cierre) {
    // Un pedido que entra a un día ya cerrado invalidaría en silencio un corte que el
    // dueño ya dio por bueno. Se rechaza: falla ruidosa y reversible.
    throw new AppError(
      CodigoError.DIA_YA_CERRADO,
      "El día de operación del pedido ya fue cerrado",
      409,
      { fechaOperativa: fecha.toISOString().slice(0, 10) },
    );
  }
}

// ---------------------------------------------------------------------------
// Idempotencia (BD-05)
//
// Reenviar un pedido tras un timeout es el caso NORMAL en una arquitectura offline,
// no un error. Debe devolver el pedido existente, no reventar.
// ---------------------------------------------------------------------------
async function buscarExistente(id: string): Promise<Pedido | null> {
  return prisma.pedido.findUnique({ where: { id } });
}

function verificarMismoPedido(existente: Pedido, input: CrearPedidoInput): Pedido {
  // Mismo UUID pero contenido distinto: el POS reusó un id. No lo enmascaramos
  // devolviendo el viejo como si nada — es un bug serio y hay que verlo.
  const mismoTotal = existente.total.equals(new Prisma.Decimal(input.total));
  const mismoFolio = existente.folio === input.folio;

  if (!mismoTotal || !mismoFolio) {
    throw new AppError(
      CodigoError.CONFLICTO_IDEMPOTENCIA,
      "Ya existe un pedido con ese id pero con contenido distinto",
      409,
      {
        id: input.id,
        folioExistente: existente.folio,
        folioEnviado: input.folio,
        totalExistente: existente.total.toFixed(2),
        totalEnviado: new Prisma.Decimal(input.total).toFixed(2),
      },
    );
  }

  return existente;
}

// ---------------------------------------------------------------------------
// Creación de pedido
// ---------------------------------------------------------------------------
export async function crearPedido(input: CrearPedidoInput): Promise<Pedido> {
  // 1. Idempotencia: ¿ya lo teníamos?
  const yaExiste = await buscarExistente(input.id);
  if (yaExiste) {
    return verificarMismoPedido(yaExiste, input);
  }

  // 2. Coherencia aritmética del pedido consigo mismo. No necesita el catálogo:
  //    atrapa bugs de suma y redondeo incluso en ventas hechas offline con precios viejos.
  const lineas: LineaPedido[] = input.items.map((item) => ({
    productoId: item.productoId,
    cantidad: item.cantidad,
    precioUnitario: item.precioUnitario,
    varianteIds: item.selecciones.map((s) => s.varianteId),
  }));

  validarAritmetica(lineas, input.total);

  // 3. El día de operación tiene que existir y estar abierto.
  const fecha = fechaDate(input.fechaOperativa);
  await validarDiaOperativo(input.sucursalId, fecha);

  // 4. Precios: el servidor decide, no el cliente.
  //
  // Para un paquete de carne el precio depende del GRUPO del corte elegido (BD-13), así que
  // hacen falta también las variantes: sin ellas no se puede saber cuánto cuesta el paquete.
  const productoIds = [...new Set(lineas.map((l) => l.productoId))];
  const varianteIds = [...new Set(lineas.flatMap((l) => l.varianteIds))];

  const [catalogoVersionActual, productos, variantes] = await Promise.all([
    obtenerCatalogoVersion(),
    prisma.producto.findMany({
      where: { id: { in: productoIds } },
      select: {
        id: true,
        nombre: true,
        precio: true,
        activo: true,
        requiereCorte: true,
        preciosPorGrupo: { select: { grupoCorteId: true, precio: true } },
      },
    }),
    prisma.productoVariante.findMany({
      where: { id: { in: varianteIds } },
      select: { id: true, nombre: true, productoId: true, grupoCorteId: true, activo: true },
    }),
  ]);

  // Snapshot de los nombres al momento de la venta (BD-15). Los escribe el SERVIDOR, igual
  // que el precio: si el nombre viniera del cliente, un POS desactualizado guardaría el
  // nombre viejo. Y si no se guardara, renombrar un producto reescribiría los tickets
  // históricos — un ticket impreso es un documento y debe poder reimprimirse idéntico.
  const nombreProducto = new Map(productos.map((p) => [p.id, p.nombre]));
  const nombreVariante = new Map(variantes.map((v) => [v.id, v.nombre]));

  // Toda variante enviada tiene que existir. `resolverPrecios` solo las comprueba para los
  // productos que llevan corte; una variante fantasma en un producto sin corte (un aderezo,
  // por ejemplo) llegaría hasta el INSERT y reventaría con un error de NOT NULL ilegible.
  for (const varianteId of varianteIds) {
    if (!nombreVariante.has(varianteId)) {
      throw new AppError("VALIDATION_ERROR", `La variante ${varianteId} no existe`, 400, {
        varianteId,
      });
    }
  }

  const catalogo = new Map<string, ProductoCatalogo>(
    productos.map((p) => [
      p.id,
      {
        id: p.id,
        precio: p.precio,
        activo: p.activo,
        requiereCorte: p.requiereCorte,
        preciosPorGrupo: new Map(p.preciosPorGrupo.map((pg) => [pg.grupoCorteId, pg.precio])),
      },
    ]),
  );

  const catalogoVariantes = new Map<string, VarianteCatalogo>(variantes.map((v) => [v.id, v]));

  const precios = resolverPrecios(
    lineas,
    catalogo,
    catalogoVariantes,
    input.catalogoVersion,
    catalogoVersionActual,
  );

  // Los precios resueltos van en el mismo orden que input.items, porque resolverPrecios
  // mapea 1 a 1 sobre las líneas que recibe.
  const itemsConPrecio = input.items.map((item, i) => ({
    item,
    precioUnitario: precios.lineas[i]!.precioUnitario,
  }));

  // 5. Persistir.
  try {
    return await prisma.$transaction(async (tx) => {
      return tx.pedido.create({
        data: {
          id: input.id,
          folio: input.folio,
          fechaOperativa: fecha,
          catalogoVersion: input.catalogoVersion,
          preciosDesactualizados: precios.preciosDesactualizados,
          sucursalId: input.sucursalId,
          dispositivoId: input.dispositivoId ?? null,
          clienteId: input.clienteId ?? null,
          origen: input.origen,
          estado: "PENDIENTE",
          metodoPago: input.metodoPago,
          // El total se recalcula desde los precios resueltos, no se copia del request.
          total: precios.total,
          notas: input.notas ?? null,
          horaRecoleccion: input.horaRecoleccion ? new Date(input.horaRecoleccion) : null,
          items: {
            create: itemsConPrecio.map(({ item, precioUnitario }) => ({
              id: item.id,
              productoId: item.productoId,
              nombreProducto: nombreProducto.get(item.productoId)!,
              cantidad: item.cantidad,
              precioUnitario,
              notas: item.notas ?? null,
              selecciones: {
                create: item.selecciones.map((sel) => ({
                  id: sel.id,
                  varianteId: sel.varianteId,
                  nombreVariante: nombreVariante.get(sel.varianteId)!,
                  proporcion: sel.proporcion,
                })),
              },
            })),
          },
        },
      });
    });
  } catch (err) {
    return manejarColision(err, input);
  }
}

// P2002 significa cosas muy distintas según QUÉ índice se violó. Confundirlas sería
// grave: una es benigna y la otra es una colisión de folio.
async function manejarColision(err: unknown, input: CrearPedidoInput): Promise<Pedido> {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    throw err;
  }

  const objetivo = String(err.meta?.["target"] ?? "");

  // Colisión sobre la PK: dos reintentos del MISMO pedido llegaron a la vez y el otro
  // ganó la carrera. Es idempotencia, no un error. Devolvemos el que quedó.
  if (objetivo.includes(INDICE_PK) || objetivo.includes("id")) {
    const existente = await buscarExistente(input.id);
    if (existente) {
      return verificarMismoPedido(existente, input);
    }
  }

  // Colisión sobre (sucursalId, fechaOperativa, folio): OTRO pedido, con otro id, ya usó
  // ese folio ese día. El contador local de la terminal se desincronizó. Es exactamente
  // el fallo que BD-03 existe para hacer visible.
  if (objetivo.includes(INDICE_FOLIO) || objetivo.includes("folio")) {
    throw new AppError(
      CodigoError.FOLIO_DUPLICADO,
      "Ya existe otro pedido con ese folio en esa sucursal y día",
      409,
      { folio: input.folio, fechaOperativa: input.fechaOperativa },
    );
  }

  throw err;
}
