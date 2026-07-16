// Versión del CONTRATO entre la terminal POS y el backend.
//
// No es la versión de release: solo se incrementa cuando cambia la forma de los
// payloads que viajan entre POS y backend (campos nuevos obligatorios, semántica
// distinta de un campo existente, etc.).
//
// Cómo funciona el handshake:
//
//   - El POS envía VERSION_CONTRATO en el header `X-App-Version` de cada request.
//     El valor queda "horneado" en el bundle compilado: una terminal con una versión
//     vieja de la app sigue enviando el número viejo, aunque el backend ya sea nuevo.
//
//   - El backend rechaza con 426 CLIENTE_DESACTUALIZADO cualquier request cuya versión
//     sea menor que VERSION_CONTRATO_MINIMA.
//
//   - El POS, al recibir 426, BLOQUEA LA SINCRONIZACIÓN pero NO la venta, y NO descarta
//     la cola: retiene las operaciones pendientes y las reintenta tras actualizarse.
//
// Ver DISENO_BLOQUE1.md §1.

// Versión que habla este build.
export const VERSION_CONTRATO = 2;

// Versión mínima que el backend acepta. Subirla deja fuera a las terminales que no se
// hayan actualizado: solo hacerlo cuando el cambio sea incompatible de verdad.
//
// Historial:
//   1 — contrato inicial de Fase 1.
//   2 — Bloque 1: el pedido lleva `fechaOperativa` y `catalogoVersion` obligatorios,
//       y el servidor deja de aceptar precios del cliente sin verificarlos.
export const VERSION_CONTRATO_MINIMA = 2;

// Header que transporta la versión.
export const HEADER_VERSION = "x-app-version";
