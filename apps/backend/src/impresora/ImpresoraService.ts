import type { DatosTicket } from "./ticket.js";

export interface ImpresoraService {
  /**
   * Imprime los dos tickets de un pedido: cliente y producción.
   * En la implementación de desarrollo genera archivos PDF.
   * En la implementación real envía comandos a la impresora térmica.
   */
  imprimir(ticket: DatosTicket): Promise<void>;
}
