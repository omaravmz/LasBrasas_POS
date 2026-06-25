import type { ProductoLocal, VarianteLocal } from "../db/types.js";

// Item en construcción (antes de persistir)
export interface ItemBorrador {
  id: string; // UUID generado al agregar
  producto: ProductoLocal;
  cantidad: number;
  notas?: string;
  cortes: CorteBorrador[]; // vacío si no requiere corte
}

export interface CorteBorrador {
  variante: VarianteLocal;
  proporcion: number; // 0.0 – 1.0, suma de todos = 1.000
}

export type BorradorPedido = ItemBorrador[];

// Calcula proporciones iguales distribuidas entre N cortes.
// El último lleva el residuo para garantizar suma exacta = 1.000.
export function distribuirProporciones(n: number): number[] {
  if (n === 0) return [];
  const base = Math.floor(1000 / n);
  const resto = 1000 - base * n;
  return Array.from({ length: n }, (_, i) =>
    (base + (i === n - 1 ? resto : 0)) / 1000
  );
}
