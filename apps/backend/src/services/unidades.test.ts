import { describe, it, expect } from "vitest";
import { aUnidadBase, aUnidadDisplay, unidadBaseDe, enBolsas, UnidadBase } from "@brasas/shared";
import { Unidad } from "@brasas/shared";

// BD-10. Antes, un mismo enum mezclaba KG con GR y LT con ML: la carne se guardaba en
// kilos y las papas en gramos. Cualquier código que sumara o comparara cantidades entre
// insumos tenía que saber la unidad de cada uno — un bug de factor 1000 esperando a
// ocurrir, justo en el descuento por receta.
//
// Ahora todo se almacena en gramos, mililitros o piezas, y la conversión vive SOLO en los
// bordes. Estos tests fijan esa frontera.

describe("unidadBaseDe", () => {
  it("kilos y gramos comparten la misma unidad de almacenamiento", () => {
    expect(unidadBaseDe(Unidad.KG)).toBe(UnidadBase.GR);
    expect(unidadBaseDe(Unidad.GR)).toBe(UnidadBase.GR);
  });

  it("litros y mililitros comparten la misma unidad de almacenamiento", () => {
    expect(unidadBaseDe(Unidad.LT)).toBe(UnidadBase.ML);
    expect(unidadBaseDe(Unidad.ML)).toBe(UnidadBase.ML);
  });

  it("las piezas no se convierten", () => {
    expect(unidadBaseDe(Unidad.PIEZA)).toBe(UnidadBase.PIEZA);
  });
});

describe("aUnidadBase", () => {
  it("convierte kilos a gramos", () => {
    expect(aUnidadBase(1.5, Unidad.KG)).toBe(1500);
    expect(aUnidadBase(0.27, Unidad.KG)).toBe(270); // carne cruda del paquete individual
  });

  it("convierte litros a mililitros", () => {
    expect(aUnidadBase(0.5, Unidad.LT)).toBe(500);
  });

  it("deja intactos gramos, mililitros y piezas", () => {
    expect(aUnidadBase(350, Unidad.GR)).toBe(350); // orden de papas
    expect(aUnidadBase(600, Unidad.ML)).toBe(600);
    expect(aUnidadBase(3, Unidad.PIEZA)).toBe(3);
  });

  it("no arrastra error de punto flotante", () => {
    // Multiplicar por 1000 en flotante NO siempre es exacto: falla en 360 de los 20 000
    // valores de 3 decimales entre 0.001 y 20 kg. Por ejemplo:
    expect(1.001 * 1000).not.toBe(1001); // da 1000.9999999999999

    // Un descuento de 1000.9999... gramos dejaría en el inventario un residuo que nunca
    // cuadra con nada. Y el error crece: la mayoría de las veces funciona, hasta que un
    // día no — que es lo que hace insidioso a este bug.
    expect(aUnidadBase(1.001, Unidad.KG)).toBe(1001);
  });

  it("preserva la resolución de la milésima", () => {
    // La columna es DECIMAL(12,3): la milésima de gramo es la resolución real.
    expect(aUnidadBase(0.0005, Unidad.KG)).toBe(0.5);
  });
});

describe("aUnidadDisplay", () => {
  it("devuelve la cantidad a la unidad en la que la piensa el negocio", () => {
    expect(aUnidadDisplay(1500, Unidad.KG)).toBe(1.5);
    expect(aUnidadDisplay(500, Unidad.LT)).toBe(0.5);
    expect(aUnidadDisplay(350, Unidad.GR)).toBe(350);
  });

  it("ida y vuelta es la identidad, incluso donde el flotante falla", () => {
    // Las cantidades reales de las recetas, más los casos que rompen el flotante.
    for (const kg of [0.27, 0.5, 0.75, 0.95, 1.13, 1.5, 1.001, 1.003, 2.007]) {
      expect(aUnidadDisplay(aUnidadBase(kg, Unidad.KG), Unidad.KG)).toBe(kg);
    }
  });

  it("gramos -> kg -> gramos no pierde el gramo", () => {
    // La división también falla: 1001 / 1000 * 1000 no vuelve a dar 1001 en flotante.
    for (const gr of [1001, 1003, 1005, 2007]) {
      expect(aUnidadBase(aUnidadDisplay(gr, Unidad.KG), Unidad.KG)).toBe(gr);
    }
  });
});

describe("enBolsas", () => {
  it("convierte gramos a bolsas para presentación", () => {
    // Una bolsa de papas rinde 1750 gr; una orden completa son 350 gr.
    expect(enBolsas(1750, 1750)).toBe(1);
    expect(enBolsas(875, 1750)).toBe(0.5);
    expect(enBolsas(5250, 1750)).toBe(3);
  });

  it("no divide entre cero", () => {
    expect(enBolsas(1000, 0)).toBe(0);
  });
});
