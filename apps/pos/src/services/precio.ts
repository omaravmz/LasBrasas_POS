import { calcularTotal } from "@brasas/shared";
import type { ProductoLocal } from "../db/types.js";
import type { ItemBorrador, CorteBorrador } from "../types/pedido.js";

// Precio de un producto según el corte elegido (BD-13).
//
// Los paquetes de carne NO cuestan lo mismo con cualquier corte: el Grupo 2 (Cabrería,
// Rib Eye) es más caro que el Grupo 1 (Diezmillo, Sirloin, New York), y el sobreprecio
// depende del paquete —escala con la cantidad de carne—.
//
// Hasta ahora el POS cobraba `producto.precio` para cualquier corte, así que un paquete
// con Rib Eye se cobraba igual que uno con Sirloin. El modelo ni siquiera podía expresar
// la diferencia.
//
// El servidor recalcula este mismo precio al recibir el pedido y rechaza cualquier
// discrepancia (BD-04). Si esta función se desvía de la del backend, la venta se rechaza.

export function grupoDeCortes(cortes: readonly CorteBorrador[]): string | null {
  const grupos = new Set(
    cortes.map((c) => c.variante.grupoCorteId).filter((g): g is string => g !== undefined),
  );

  if (grupos.size !== 1) return null; // ninguno, o mezcla inválida (RN-01)
  return [...grupos][0]!;
}

export function precioDeProducto(
  producto: ProductoLocal,
  cortes: readonly CorteBorrador[],
): number {
  if (!producto.requiereCorte) return producto.precio;

  const grupoCorteId = grupoDeCortes(cortes);
  if (grupoCorteId === null) return 0; // todavía no se ha elegido corte

  const precio = producto.preciosPorGrupo.find((p) => p.grupoCorteId === grupoCorteId);
  return precio?.precio ?? 0;
}

// Precio de un grupo concreto, para mostrarlo en el selector de cortes antes de elegir.
export function precioDeGrupo(producto: ProductoLocal, grupoCorteId: string): number {
  if (!producto.requiereCorte) return producto.precio;
  return producto.preciosPorGrupo.find((p) => p.grupoCorteId === grupoCorteId)?.precio ?? 0;
}

export function precioDeItem(item: ItemBorrador): number {
  return precioDeProducto(item.producto, item.cortes);
}

// Total del pedido. En centavos enteros: sumar en punto flotante produce totales como
// 665.5000000000001, y el backend —que valida en Decimal— rechazaría una venta legítima.
export function totalDelBorrador(borrador: readonly ItemBorrador[]): number {
  return calcularTotal(
    borrador.map((i) => ({ precioUnitario: precioDeItem(i), cantidad: i.cantidad })),
  );
}
