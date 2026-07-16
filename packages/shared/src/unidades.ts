import { Unidad } from "./types/index.js";

// Conversión entre la unidad de ALMACENAMIENTO y la de PRESENTACIÓN (BD-10).
//
// Regla del sistema: dentro, todo el inventario vive en una sola escala por dimensión
// —gramos, mililitros o piezas—. La unidad de display solo existe en los bordes: cuando
// el encargado captura "2.5 kg de sirloin" y cuando la pantalla se lo muestra de vuelta.
//
// Antes, un mismo enum mezclaba KG con GR y LT con ML: la carne se guardaba en kilos y
// las papas en gramos. Cualquier código que sumara, comparara o convirtiera cantidades
// entre insumos tenía que saber la unidad de cada uno — un bug de factor 1000 esperando a
// ocurrir, y el lugar donde iba a ocurrir es el descuento por receta.
//
// La lógica de inventario NUNCA llama a estas funciones. Si lo hace, es que la conversión
// se está colando hacia dentro.

export enum UnidadBase {
  GR = "GR",
  ML = "ML",
  PIEZA = "PIEZA",
}

// Cuántas unidades base vale una unidad de display.
const FACTOR: Record<Unidad, number> = {
  [Unidad.KG]: 1000, // 1 kg = 1000 gr
  [Unidad.GR]: 1,
  [Unidad.LT]: 1000, // 1 lt = 1000 ml
  [Unidad.ML]: 1,
  [Unidad.PIEZA]: 1,
};

// Unidad base que corresponde a cada unidad de display.
const BASE_DE: Record<Unidad, UnidadBase> = {
  [Unidad.KG]: UnidadBase.GR,
  [Unidad.GR]: UnidadBase.GR,
  [Unidad.LT]: UnidadBase.ML,
  [Unidad.ML]: UnidadBase.ML,
  [Unidad.PIEZA]: UnidadBase.PIEZA,
};

export function unidadBaseDe(display: Unidad): UnidadBase {
  return BASE_DE[display];
}

// De lo que el usuario escribe a lo que la base almacena. "2.5 kg" -> 2500 gr.
export function aUnidadBase(cantidad: number, display: Unidad): number {
  // En milésimas de la unidad base, para no arrastrar error de punto flotante: la columna
  // es DECIMAL(12,3), así que la milésima es la resolución real del sistema.
  const milesimas = Math.round(cantidad * FACTOR[display] * 1000);
  return milesimas / 1000;
}

// De lo que la base almacena a lo que el usuario ve. 2500 gr -> "2.5 kg".
export function aUnidadDisplay(cantidad: number, display: Unidad): number {
  const milesimas = Math.round((cantidad / FACTOR[display]) * 1000);
  return milesimas / 1000;
}

// Cuántas bolsas equivalen a una cantidad. Solo presentación: el inventario se descuenta
// en la unidad base, nunca en bolsas.
export function enBolsas(cantidadBase: number, rendimientoBolsa: number): number {
  if (rendimientoBolsa <= 0) return 0;
  return Math.round((cantidadBase / rendimientoBolsa) * 100) / 100;
}

export function abreviatura(display: Unidad): string {
  switch (display) {
    case Unidad.KG:
      return "kg";
    case Unidad.GR:
      return "gr";
    case Unidad.LT:
      return "lt";
    case Unidad.ML:
      return "ml";
    case Unidad.PIEZA:
      return "pz";
  }
}
