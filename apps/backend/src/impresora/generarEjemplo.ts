import { DevImpresoraService } from "./DevImpresoraService.js";
import type { DatosTicket } from "./ticket.js";

const pedido: DatosTicket = {
  folio: 42,
  sucursal: "Pradera Dorada",
  fecha: new Date("2026-05-27T19:34:00Z"),
  origen: "MOSTRADOR",
  metodoPago: "EFECTIVO",
  total: 545,
  lineas: [
    {
      cantidad: 2,
      nombre: "Carne Asada 2 personas",
      precioUnitario: 220,
      subtotal: 440,
      cortes: [{ nombre: "Sirloin", proporcion: 1.0 }],
    },
    {
      cantidad: 1,
      nombre: "¼ Pollo",
      precioUnitario: 80,
      subtotal: 80,
    },
    {
      cantidad: 1,
      nombre: "Refresco 600ml",
      precioUnitario: 25,
      subtotal: 25,
    },
  ],
};

const impresora = new DevImpresoraService();
await impresora.imprimir(pedido);
