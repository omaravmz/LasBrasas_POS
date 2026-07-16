import { Prisma } from "@prisma/client";
import { CodigoError } from "@brasas/shared";
import { AppError } from "../middleware/errorHandler.js";

// Validación del dinero de un pedido (BD-04, BD-13). Ver DISENO_BLOQUE1.md §4.
//
// Este módulo es PURO: no toca la base de datos. Recibe las líneas del pedido y el
// catálogo, y decide. Así la lógica más delicada del sistema —la que decide qué venta entra
// a la contabilidad y con qué importe— se puede probar exhaustivamente sin levantar una base.
//
// Toda la aritmética es en Decimal. Nunca en `number`: sumar 0.1 + 0.2 en punto flotante
// da 0.30000000000000004, y un pedido de $180.00 podría "no cuadrar" contra sí mismo.

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export interface LineaPedido {
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  // Variantes elegidas para esta línea. En un paquete de carne son los cortes; su grupo
  // determina el PRECIO del paquete (BD-13).
  varianteIds: string[];
}

export interface VarianteCatalogo {
  id: string;
  productoId: string;
  // Solo los cortes de carne tienen grupo. Aderezos y tamaños de bebida son null.
  grupoCorteId: string | null;
  activo: boolean;
}

export interface ProductoCatalogo {
  id: string;
  // Precio de los productos SIN corte. Para los que llevan corte, el precio sale de
  // `preciosPorGrupo` según el grupo elegido.
  precio: Decimal;
  requiereCorte: boolean;
  activo: boolean;
  preciosPorGrupo: ReadonlyMap<string, Decimal>; // grupoCorteId -> precio
}

export interface LineaResuelta {
  productoId: string;
  cantidad: number;
  precioUnitario: Decimal;
}

export interface PreciosResueltos {
  lineas: LineaResuelta[];
  total: Decimal;
  preciosDesactualizados: boolean;
}

// ---------------------------------------------------------------------------
// 1. Coherencia aritmética — SIEMPRE, sin importar la versión del catálogo
// ---------------------------------------------------------------------------
//
// Es la mitad del valor de BD-04 y es gratis: no necesita el catálogo. Atrapa bugs de
// redondeo y de suma del POS aunque la venta venga de una terminal que estuvo offline tres
// horas con precios viejos, porque no compara contra el catálogo — compara el pedido
// consigo mismo.

export function calcularTotal(lineas: readonly LineaResuelta[]): Decimal {
  return lineas.reduce(
    (suma, l) => suma.plus(l.precioUnitario.times(l.cantidad)),
    new Decimal(0),
  );
}

export function validarAritmetica(lineas: readonly LineaPedido[], total: number): void {
  if (lineas.length === 0) {
    throw new AppError("VALIDATION_ERROR", "El pedido no tiene líneas", 400);
  }

  for (const linea of lineas) {
    if (!Number.isInteger(linea.cantidad) || linea.cantidad <= 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Cantidad inválida en el producto ${linea.productoId}: debe ser un entero mayor que cero`,
        400,
        { productoId: linea.productoId, cantidad: linea.cantidad },
      );
    }

    if (!Number.isFinite(linea.precioUnitario) || linea.precioUnitario < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Precio inválido en el producto ${linea.productoId}: no puede ser negativo`,
        400,
        { productoId: linea.productoId, precioUnitario: linea.precioUnitario },
      );
    }
  }

  if (!Number.isFinite(total) || total < 0) {
    throw new AppError("VALIDATION_ERROR", "El total no puede ser negativo", 400, { total });
  }

  const calculado = calcularTotal(
    lineas.map((l) => ({
      productoId: l.productoId,
      cantidad: l.cantidad,
      precioUnitario: new Decimal(l.precioUnitario),
    })),
  );

  const declarado = new Decimal(total);

  if (!calculado.equals(declarado)) {
    throw new AppError(
      CodigoError.TOTAL_INCONSISTENTE,
      "El total del pedido no coincide con la suma de sus líneas",
      422,
      { totalDeclarado: declarado.toFixed(2), totalCalculado: calculado.toFixed(2) },
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Grupo de corte de una línea (RN-01) y precio que le corresponde (BD-13)
// ---------------------------------------------------------------------------

// Devuelve el grupo de corte de una línea de carne, verificando RN-01 por el camino.
//
// RN-01 no es solo una regla de negocio incómoda: si un ítem mezclara cortes de grupos
// distintos, el precio del paquete sería AMBIGUO — no habría forma de saber cuánto cobrar.
// La regla y el precio son la misma cosa.
export function grupoDeLinea(
  linea: LineaPedido,
  variantes: ReadonlyMap<string, VarianteCatalogo>,
): string {
  const grupos = new Set<string>();

  for (const varianteId of linea.varianteIds) {
    const variante = variantes.get(varianteId);

    if (!variante) {
      throw new AppError("VALIDATION_ERROR", `La variante ${varianteId} no existe`, 400, {
        varianteId,
      });
    }

    if (variante.productoId !== linea.productoId) {
      throw new AppError(
        "VALIDATION_ERROR",
        `La variante ${varianteId} no pertenece al producto ${linea.productoId}`,
        400,
      );
    }

    if (variante.grupoCorteId !== null) grupos.add(variante.grupoCorteId);
  }

  if (grupos.size === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `El producto ${linea.productoId} requiere elegir un corte`,
      400,
      { productoId: linea.productoId },
    );
  }

  if (grupos.size > 1) {
    // RN-01
    throw new AppError(
      "GRUPOS_MEZCLADOS",
      "No se pueden mezclar cortes de grupos de precio distintos en el mismo paquete",
      422,
      { productoId: linea.productoId, grupos: [...grupos] },
    );
  }

  return [...grupos][0]!;
}

function precioDeCatalogo(
  linea: LineaPedido,
  producto: ProductoCatalogo,
  variantes: ReadonlyMap<string, VarianteCatalogo>,
): Decimal {
  if (!producto.requiereCorte) return producto.precio;

  const grupoCorteId = grupoDeLinea(linea, variantes);
  const precio = producto.preciosPorGrupo.get(grupoCorteId);

  if (precio === undefined) {
    throw new AppError(
      "VALIDATION_ERROR",
      `El producto ${linea.productoId} no tiene precio definido para el grupo de corte elegido`,
      422,
      { productoId: linea.productoId, grupoCorteId },
    );
  }

  return precio;
}

// ---------------------------------------------------------------------------
// 3. Resolución de precios contra el catálogo
// ---------------------------------------------------------------------------

export function resolverPrecios(
  lineas: readonly LineaPedido[],
  catalogo: ReadonlyMap<string, ProductoCatalogo>,
  variantes: ReadonlyMap<string, VarianteCatalogo>,
  catalogoVersionPedido: number,
  catalogoVersionActual: number,
): PreciosResueltos {
  if (catalogoVersionPedido > catalogoVersionActual) {
    // La terminal dice tener una versión que el servidor nunca emitió. No hay
    // interpretación benigna: o los datos vienen corruptos, o alguien los fabricó.
    throw new AppError(
      CodigoError.CATALOGO_INCONSISTENTE,
      "La versión de catálogo del pedido es posterior a la del servidor",
      409,
      { versionPedido: catalogoVersionPedido, versionServidor: catalogoVersionActual },
    );
  }

  const catalogoVigente = catalogoVersionPedido === catalogoVersionActual;

  const resueltas: LineaResuelta[] = lineas.map((linea) => {
    const producto = catalogo.get(linea.productoId);

    if (!producto) {
      throw new AppError("VALIDATION_ERROR", `El producto ${linea.productoId} no existe`, 400, {
        productoId: linea.productoId,
      });
    }

    const precioCliente = new Decimal(linea.precioUnitario);

    if (!catalogoVigente) {
      // La terminal cotizó con un catálogo anterior. El precio pudo cambiar mientras estaba
      // offline — y la venta YA OCURRIÓ a ese precio: el cliente pagó y se llevó su comida.
      // Rechazarla sería absurdo. Se acepta el precio del cliente como snapshot histórico y
      // el pedido queda marcado para que el dueño lo vea.
      //
      // RN-01 sí se sigue exigiendo: mezclar grupos nunca fue válido, ni siquiera offline.
      if (producto.requiereCorte) grupoDeLinea(linea, variantes);

      return {
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        precioUnitario: precioCliente,
      };
    }

    // Catálogo vigente: el servidor manda. Cualquier diferencia es un bug del POS o una
    // petición manipulada, no una explicación legítima.
    if (!producto.activo) {
      throw new AppError("VALIDATION_ERROR", `El producto ${linea.productoId} no está activo`, 400, {
        productoId: linea.productoId,
      });
    }

    const precioCatalogo = precioDeCatalogo(linea, producto, variantes);

    if (!precioCliente.equals(precioCatalogo)) {
      throw new AppError(
        CodigoError.PRECIO_INVALIDO,
        `El precio enviado para el producto ${linea.productoId} no coincide con el del catálogo`,
        422,
        {
          productoId: linea.productoId,
          precioEnviado: precioCliente.toFixed(2),
          precioCatalogo: precioCatalogo.toFixed(2),
        },
      );
    }

    // El precio que se persiste sale del CATÁLOGO, no del request. El snapshot histórico de
    // ItemPedido.precioUnitario se conserva, pero lo escribe el servidor. Esa es la
    // diferencia entera respecto al comportamiento anterior.
    return {
      productoId: linea.productoId,
      cantidad: linea.cantidad,
      precioUnitario: precioCatalogo,
    };
  });

  return {
    lineas: resueltas,
    total: calcularTotal(resueltas),
    preciosDesactualizados: !catalogoVigente,
  };
}
