import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "fs";
import { join, resolve } from "path";
import type { ImpresoraService } from "./ImpresoraService.js";
import type { DatosTicket } from "./ticket.js";
import { generarTicketCliente, generarTicketProduccion } from "./generarTicket.js";

// 80mm en puntos PDF (1 punto = 1/72 pulgada; 80mm = 3.15" = 226.8pt)
const ANCHO_PT = 226.8;
const MARGEN = 8;
const FUENTE_SIZE = 7.5;
const FUENTE_SIZE_HEADER = 9;
const LINE_HEIGHT = 10.5;
const LOGO_ALTO = 50;

const LOGO_PATH = resolve(process.cwd(), "../../assets/logo.jpeg");
const OUTPUT_DIR = resolve("./tickets-dev");

export class DevImpresoraService implements ImpresoraService {
  async imprimir(datos: DatosTicket): Promise<void> {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const folio = String(datos.folio).padStart(3, "0");

    await Promise.all([
      this.generarPDF(
        generarTicketCliente(datos),
        join(OUTPUT_DIR, `ticket-${folio}-cliente.pdf`),
        true
      ),
      this.generarPDF(
        generarTicketProduccion(datos),
        join(OUTPUT_DIR, `ticket-${folio}-produccion.pdf`),
        false
      ),
    ]);

    console.log(`[DevImpresora] Tickets generados en ${OUTPUT_DIR}/`);
    console.log(`  → ticket-${folio}-cliente.pdf`);
    console.log(`  → ticket-${folio}-produccion.pdf`);
  }

  private generarPDF(
    lineas: string[],
    rutaSalida: string,
    conLogo: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const altoEstimado =
        MARGEN * 2 +
        (conLogo ? LOGO_ALTO + 10 : 0) +
        lineas.length * LINE_HEIGHT +
        20;

      const doc = new PDFDocument({
        size: [ANCHO_PT, altoEstimado],
        margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
      });

      const stream = createWriteStream(rutaSalida);
      doc.pipe(stream);

      let y = MARGEN;

      // Logo (solo ticket cliente)
      if (conLogo) {
        try {
          doc.image(LOGO_PATH, MARGEN, y, {
            fit: [ANCHO_PT - MARGEN * 2, LOGO_ALTO],
            align: "center",
          });
          y += LOGO_ALTO + 6;
        } catch {
          // Logo no disponible en este entorno — continuar sin él
        }
      }

      // Renderizar líneas
      for (const linea of lineas) {
        const esEncabezado =
          linea.includes("LAS BRASAS") || linea.includes("PRODUCCIÓN");

        doc
          .font(esEncabezado ? "Courier-Bold" : "Courier")
          .fontSize(esEncabezado ? FUENTE_SIZE_HEADER : FUENTE_SIZE)
          .text(linea, MARGEN, y, { width: ANCHO_PT - MARGEN * 2, lineBreak: false });

        y += LINE_HEIGHT;
      }

      doc.end();

      stream.on("finish", () => resolve());
      stream.on("error", reject);
    });
  }
}
