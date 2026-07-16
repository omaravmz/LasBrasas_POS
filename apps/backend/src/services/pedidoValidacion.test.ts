import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  calcularTotal,
  grupoDeLinea,
  resolverPrecios,
  validarAritmetica,
  validarProporciones,
  type LineaPedido,
  type ProductoCatalogo,
  type VarianteCatalogo,
} from "./pedidoValidacion.js";
import { AppError } from "../middleware/errorHandler.js";

const D = (n: string | number): Prisma.Decimal => new Prisma.Decimal(n);

const PAQUETE = "producto-paquete-2p";
const REFRESCO = "producto-refresco-600";

const G1 = "grupo-corte-1"; // Diezmillo, Sirloin, New York
const G2 = "grupo-corte-2"; // Cabrería, Rib Eye — más caro

// Cortes del paquete de 2 personas.
const VARIANTES: ReadonlyMap<string, VarianteCatalogo> = new Map<string, VarianteCatalogo>([
  ["sirloin", { id: "sirloin", productoId: PAQUETE, grupoCorteId: G1, activo: true }],
  ["diezmillo", { id: "diezmillo", productoId: PAQUETE, grupoCorteId: G1, activo: true }],
  ["ribeye", { id: "ribeye", productoId: PAQUETE, grupoCorteId: G2, activo: true }],
  ["cabreria", { id: "cabreria", productoId: PAQUETE, grupoCorteId: G2, activo: true }],
  // Un aderezo: variante SIN grupo de corte.
  ["ranch", { id: "ranch", productoId: REFRESCO, grupoCorteId: null, activo: true }],
]);

// El paquete de 2 personas: $220 con cortes del Grupo 1, $260 con los del Grupo 2.
const PAQUETE_2P: ProductoCatalogo = {
  id: PAQUETE,
  precio: D("0"), // no se usa: requiereCorte
  requiereCorte: true,
  activo: true,
  preciosPorGrupo: new Map([
    [G1, D("220.00")],
    [G2, D("260.00")],
  ]),
};

const REFRESCO_600: ProductoCatalogo = {
  id: REFRESCO,
  precio: D("25.50"),
  requiereCorte: false,
  activo: true,
  preciosPorGrupo: new Map(),
};

const CATALOGO: ReadonlyMap<string, ProductoCatalogo> = new Map([
  [PAQUETE, PAQUETE_2P],
  [REFRESCO, REFRESCO_600],
]);

const VERSION = 7;

function linea(over: Partial<LineaPedido> = {}): LineaPedido {
  return {
    productoId: REFRESCO,
    cantidad: 1,
    precioUnitario: 25.5,
    varianteIds: [],
    ...over,
  };
}

function codigoDelError(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error("Se esperaba que lanzara un AppError, pero no lanzó nada");
}

describe("calcularTotal", () => {
  it("suma precio × cantidad de cada línea", () => {
    const total = calcularTotal([
      { productoId: PAQUETE, cantidad: 2, precioUnitario: D("320.00") },
      { productoId: REFRESCO, cantidad: 3, precioUnitario: D("25.50") },
    ]);

    expect(total.toFixed(2)).toBe("716.50");
  });

  it("no arrastra error de punto flotante", () => {
    // 0.1 + 0.2 en punto flotante da 0.30000000000000004. En Decimal, no.
    const total = calcularTotal([
      { productoId: "a", cantidad: 1, precioUnitario: D("0.10") },
      { productoId: "b", cantidad: 1, precioUnitario: D("0.20") },
    ]);

    expect(total.equals(D("0.30"))).toBe(true);
  });
});

describe("validarAritmetica", () => {
  const lineas: LineaPedido[] = [
    linea({ productoId: PAQUETE, cantidad: 2, precioUnitario: 220, varianteIds: ["sirloin"] }),
    linea({ cantidad: 1, precioUnitario: 25.5 }),
  ];

  it("acepta un total que coincide con la suma de las líneas", () => {
    expect(() => validarAritmetica(lineas, 465.5)).not.toThrow();
  });

  it("rechaza un total que no coincide", () => {
    // El agujero que cerramos: antes el backend guardaba el total que le mandara el
    // cliente, sin comprobarlo contra sus propias líneas.
    expect(codigoDelError(() => validarAritmetica(lineas, 300))).toBe("TOTAL_INCONSISTENTE");
  });

  it("rechaza un total inflado aunque sea por un centavo", () => {
    expect(codigoDelError(() => validarAritmetica(lineas, 465.51))).toBe("TOTAL_INCONSISTENTE");
  });

  it("rechaza cantidad cero, negativa o fraccionaria", () => {
    expect(codigoDelError(() => validarAritmetica([linea({ cantidad: 0 })], 0))).toBe("VALIDATION_ERROR");
    expect(codigoDelError(() => validarAritmetica([linea({ cantidad: -1 })], -25.5))).toBe("VALIDATION_ERROR");
    expect(codigoDelError(() => validarAritmetica([linea({ cantidad: 1.5 })], 38.25))).toBe("VALIDATION_ERROR");
  });

  it("rechaza precio negativo y total negativo", () => {
    expect(codigoDelError(() => validarAritmetica([linea({ precioUnitario: -10 })], -10))).toBe("VALIDATION_ERROR");
  });

  it("rechaza un pedido sin líneas", () => {
    expect(codigoDelError(() => validarAritmetica([], 0))).toBe("VALIDATION_ERROR");
  });

  it("acepta un producto de cortesía (precio cero)", () => {
    expect(() => validarAritmetica([linea({ precioUnitario: 0 })], 0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// BD-13 · El grupo del corte determina el precio, y RN-01 deja de ser opcional
// ---------------------------------------------------------------------------
describe("grupoDeLinea (RN-01)", () => {
  it("devuelve el grupo cuando todos los cortes son del mismo", () => {
    const l = linea({ productoId: PAQUETE, varianteIds: ["sirloin", "diezmillo"] });
    expect(grupoDeLinea(l, VARIANTES)).toBe(G1);
  });

  it("rechaza mezclar cortes de grupos distintos", () => {
    // RN-01 no es solo una regla incómoda: si un ítem mezclara grupos, el precio del
    // paquete sería AMBIGUO. La regla y el precio son la misma cosa.
    const l = linea({ productoId: PAQUETE, varianteIds: ["sirloin", "ribeye"] });
    expect(codigoDelError(() => grupoDeLinea(l, VARIANTES))).toBe("GRUPOS_MEZCLADOS");
  });

  it("rechaza un paquete de carne sin ningún corte elegido", () => {
    const l = linea({ productoId: PAQUETE, varianteIds: [] });
    expect(codigoDelError(() => grupoDeLinea(l, VARIANTES))).toBe("VALIDATION_ERROR");
  });

  it("rechaza una variante que no existe", () => {
    const l = linea({ productoId: PAQUETE, varianteIds: ["fantasma"] });
    expect(codigoDelError(() => grupoDeLinea(l, VARIANTES))).toBe("VALIDATION_ERROR");
  });

  it("rechaza una variante de otro producto", () => {
    const l = linea({ productoId: PAQUETE, varianteIds: ["ranch"] });
    expect(codigoDelError(() => grupoDeLinea(l, VARIANTES))).toBe("VALIDATION_ERROR");
  });
});

describe("resolverPrecios — el corte determina el precio (BD-13)", () => {
  it("cobra el precio del Grupo 1 con cortes del Grupo 1", () => {
    const r = resolverPrecios(
      [linea({ productoId: PAQUETE, cantidad: 1, precioUnitario: 220, varianteIds: ["sirloin"] })],
      CATALOGO,
      VARIANTES,
      VERSION,
      VERSION,
    );

    expect(r.total.toFixed(2)).toBe("220.00");
  });

  it("cobra MÁS con cortes del Grupo 2", () => {
    // Este es el bug que BD-13 destapó: hasta ahora, un paquete con Rib Eye se cobraba
    // exactamente igual que uno con Sirloin, porque el precio vivía solo en Producto.
    const r = resolverPrecios(
      [linea({ productoId: PAQUETE, cantidad: 1, precioUnitario: 260, varianteIds: ["ribeye"] })],
      CATALOGO,
      VARIANTES,
      VERSION,
      VERSION,
    );

    expect(r.total.toFixed(2)).toBe("260.00");
  });

  it("rechaza pagar el precio del Grupo 1 llevándose cortes del Grupo 2", () => {
    const code = codigoDelError(() =>
      resolverPrecios(
        [linea({ productoId: PAQUETE, cantidad: 1, precioUnitario: 220, varianteIds: ["ribeye"] })],
        CATALOGO,
        VARIANTES,
        VERSION,
        VERSION,
      ),
    );

    expect(code).toBe("PRECIO_INVALIDO");
  });

  it("una mezcla de grupos se rechaza también al cotizar", () => {
    const code = codigoDelError(() =>
      resolverPrecios(
        [linea({ productoId: PAQUETE, cantidad: 1, precioUnitario: 220, varianteIds: ["sirloin", "ribeye"] })],
        CATALOGO,
        VARIANTES,
        VERSION,
        VERSION,
      ),
    );

    expect(code).toBe("GRUPOS_MEZCLADOS");
  });

  it("mezclar cortes DENTRO del mismo grupo sí se permite", () => {
    const r = resolverPrecios(
      [linea({ productoId: PAQUETE, cantidad: 1, precioUnitario: 220, varianteIds: ["sirloin", "diezmillo"] })],
      CATALOGO,
      VARIANTES,
      VERSION,
      VERSION,
    );

    expect(r.total.toFixed(2)).toBe("220.00");
  });
});

describe("resolverPrecios — catálogo vigente", () => {
  it("toma el precio del CATÁLOGO, no el del request", () => {
    const r = resolverPrecios([linea({ cantidad: 2 })], CATALOGO, VARIANTES, VERSION, VERSION);

    expect(r.lineas[0]!.precioUnitario.toFixed(2)).toBe("25.50");
    expect(r.total.toFixed(2)).toBe("51.00");
    expect(r.preciosDesactualizados).toBe(false);
  });

  it("rechaza un precio que no coincide con el catálogo", () => {
    const code = codigoDelError(() =>
      resolverPrecios([linea({ precioUnitario: 1 })], CATALOGO, VARIANTES, VERSION, VERSION),
    );

    expect(code).toBe("PRECIO_INVALIDO");
  });

  it("rechaza un producto dado de baja", () => {
    const conBaja: ReadonlyMap<string, ProductoCatalogo> = new Map([
      [REFRESCO, { ...REFRESCO_600, activo: false }],
    ]);

    const code = codigoDelError(() =>
      resolverPrecios([linea()], conBaja, VARIANTES, VERSION, VERSION),
    );

    expect(code).toBe("VALIDATION_ERROR");
  });

  it("rechaza un producto que no existe", () => {
    const code = codigoDelError(() =>
      resolverPrecios([linea({ productoId: "fantasma" })], CATALOGO, VARIANTES, VERSION, VERSION),
    );

    expect(code).toBe("VALIDATION_ERROR");
  });
});

describe("resolverPrecios — catálogo desactualizado (venta offline)", () => {
  // La terminal vendió estando offline; mientras tanto el precio subió. Esa venta YA
  // OCURRIÓ: el cliente pagó y se llevó su comida. Rechazarla sería absurdo.
  it("acepta el precio viejo del cliente y marca el pedido", () => {
    const r = resolverPrecios(
      [linea({ precioUnitario: 20 })], // el catálogo ahora dice 25.50
      CATALOGO,
      VARIANTES,
      5, // versión con la que cotizó la terminal
      9, // versión actual del servidor
    );

    expect(r.lineas[0]!.precioUnitario.toFixed(2)).toBe("20.00");
    expect(r.preciosDesactualizados).toBe(true);
  });

  it("pero RN-01 se sigue exigiendo: mezclar grupos nunca fue válido, ni offline", () => {
    const code = codigoDelError(() =>
      resolverPrecios(
        [linea({ productoId: PAQUETE, precioUnitario: 200, varianteIds: ["sirloin", "ribeye"] })],
        CATALOGO,
        VARIANTES,
        5,
        9,
      ),
    );

    expect(code).toBe("GRUPOS_MEZCLADOS");
  });

  it("rechaza una versión de catálogo que el servidor nunca emitió", () => {
    const code = codigoDelError(() =>
      resolverPrecios([linea()], CATALOGO, VARIANTES, 99, 9),
    );

    expect(code).toBe("CATALOGO_INCONSISTENTE");
  });
});

// ---------------------------------------------------------------------------
// RN-02 — Proporciones de los cortes
// ---------------------------------------------------------------------------

describe("validarProporciones (RN-02)", () => {
  function codigoDe(fn: () => void): string | undefined {
    try {
      fn();
      return undefined;
    } catch (err) {
      return err instanceof AppError ? err.code : "NO_APP_ERROR";
    }
  }

  it("acepta un ítem sin cortes (nada que sumar)", () => {
    expect(() => validarProporciones([{ productoId: REFRESCO, proporciones: [] }])).not.toThrow();
  });

  it("acepta un solo corte con proporción 1.000", () => {
    expect(() => validarProporciones([{ productoId: PAQUETE, proporciones: [1] }])).not.toThrow();
  });

  it("acepta una mezcla mitad y mitad", () => {
    expect(() =>
      validarProporciones([{ productoId: PAQUETE, proporciones: [0.5, 0.5] }]),
    ).not.toThrow();
  });

  it("acepta tres tercios que suman 1.000 exacto (sin error de flotante)", () => {
    // 0.333 + 0.333 + 0.334 = 1.000 en Decimal; en flotante daría 0.9999999999999999.
    expect(() =>
      validarProporciones([{ productoId: PAQUETE, proporciones: [0.333, 0.333, 0.334] }]),
    ).not.toThrow();
  });

  it("rechaza cuando las proporciones no suman 1.000", () => {
    expect(codigoDe(() => validarProporciones([{ productoId: PAQUETE, proporciones: [0.5, 0.4] }]))).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rechaza cuando suman más de 1.000", () => {
    expect(
      codigoDe(() => validarProporciones([{ productoId: PAQUETE, proporciones: [0.6, 0.6] }])),
    ).toBe("VALIDATION_ERROR");
  });

  it("rechaza una proporción de cero", () => {
    expect(codigoDe(() => validarProporciones([{ productoId: PAQUETE, proporciones: [1, 0] }]))).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rechaza una proporción negativa", () => {
    expect(
      codigoDe(() => validarProporciones([{ productoId: PAQUETE, proporciones: [1.5, -0.5] }])),
    ).toBe("VALIDATION_ERROR");
  });

  it("valida cada ítem del pedido de forma independiente", () => {
    // El primero cuadra; el segundo no. Debe fallar por el segundo.
    expect(
      codigoDe(() =>
        validarProporciones([
          { productoId: PAQUETE, proporciones: [1] },
          { productoId: "otro-paquete", proporciones: [0.5, 0.3] },
        ]),
      ),
    ).toBe("VALIDATION_ERROR");
  });
});
