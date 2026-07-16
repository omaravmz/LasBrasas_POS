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
