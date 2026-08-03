// Día de operación de la terminal (BD-02).
//
// La fecha operativa de un pedido la estampa LA TERMINAL, no el servidor. Si el
// servidor la dedujera al sincronizar, un pedido que llega a las 00:30 —porque la
// terminal estuvo sin conexión— se contaría en el día siguiente, y descuadraría los
// dos cortes de caja. La terminal es la única que sabe en qué jornada se hizo la venta.
//
// Ver DISENO_BLOQUE1.md §2.

const ZONA = "America/Mazatlan";

// "YYYY-MM-DD" en hora local del negocio. `en-CA` da exactamente ese formato.
export function diaOperativo(momento: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(momento);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Muestra una fecha operativa ("2026-06-14" → "14 jun") SIN pasar por Date.
//
// `new Date("2026-06-14")` se interpreta como medianoche UTC; al formatearla en hora de
// Mazatlán (UTC-7) retrocede al día 13. Una fecha operativa ya viene en hora del negocio:
// convertirla otra vez la corrompe. Se formatea a partir de sus propias partes.
export function fechaOperativaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split("-");
  if (!mes || !dia) return fecha;
  return `${Number(dia)} ${MESES[Number(mes) - 1] ?? ""}`.trim();
}
