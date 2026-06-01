import { useState } from "react";
import type { ItemBorrador } from "../types/pedido.js";
import { MetodoPago } from "@brasas/shared";
import { IcoClose, IcoPrint } from "./Iconos.js";

interface Props {
  items: ItemBorrador[];
  folio: number;
  sucursal: string;
  onCerrar: () => void;
  onConfirmar: (metodoPago: MetodoPago) => void;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: MetodoPago.EFECTIVO, etiqueta: "Efectivo" },
  { valor: MetodoPago.TARJETA, etiqueta: "Tarjeta" },
  { valor: MetodoPago.TRANSFERENCIA, etiqueta: "Transferencia" },
];

export function VistaPreviewTicket({ items, folio, sucursal, onCerrar, onConfirmar }: Props) {
  const [metodoPago, setMetodoPago] = useState<MetodoPago>(MetodoPago.EFECTIVO);

  const subtotal = items.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  const now = new Date();
  const fecha = now.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora  = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="modal-back" onClick={onCerrar}>
      <div className="modal" style={{ width: 460, maxHeight: 780 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Vista previa</h2>
            <div className="sub">Así se verá el ticket impreso para el cliente</div>
          </div>
          <button className="close" onClick={onCerrar}><IcoClose size={18} /></button>
        </div>

        <div className="modal-body" style={{ background: "var(--surface-2)" }}>
          <div className="ticket">
            <div className="center big">LAS BRASAS</div>
            <div className="center sm">{sucursal} · Culiacán, Sin.</div>
            <hr />
            <div className="row"><span>Folio</span><strong>#{String(folio).padStart(3, "0")}</strong></div>
            <div className="row"><span>Fecha</span><span>{fecha} {hora}</span></div>
            <div className="row"><span>Terminal</span><span>POS-01</span></div>
            <hr />
            {items.map((item) => (
              <div key={item.id} style={{ marginBottom: 6 }}>
                <div className="row">
                  <span>{item.cantidad}× {item.producto.nombre}</span>
                  <span>{fmt(item.producto.precio * item.cantidad)}</span>
                </div>
                {item.cortes.length > 0 && (
                  <div className="item-meta">
                    {item.cortes.length === 1
                      ? item.cortes[0]!.variante.nombre
                      : item.cortes.map((c) => c.variante.nombre).join(" · ") + " (mezcla)"}
                  </div>
                )}
                {item.notas && <div className="item-meta">Nota: {item.notas}</div>}
              </div>
            ))}
            <hr />
            <div className="row" style={{ fontSize: 14, fontWeight: 700 }}>
              <span>TOTAL</span><span>{fmt(subtotal)}</span>
            </div>
            <hr />
            <div className="center sm">¡Gracias por su compra!</div>
            <div className="center sm">WhatsApp 667-176-0101 · @lasbrasascln</div>
          </div>
        </div>

        {/* Selector de método de pago */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Método de pago
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {METODOS.map(({ valor, etiqueta }) => (
              <button
                key={valor}
                onClick={() => setMetodoPago(valor)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 8,
                  border: "1.5px solid",
                  fontFamily: "var(--font)",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  borderColor: metodoPago === valor ? "var(--accent)" : "var(--border)",
                  background: metodoPago === valor
                    ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
                    : "transparent",
                  color: metodoPago === valor ? "var(--accent)" : "var(--text-2)",
                }}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onCerrar}>Cerrar</button>
          <button className="btn primary" onClick={() => onConfirmar(metodoPago)}>
            <IcoPrint size={18} /> Cobrar e imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
