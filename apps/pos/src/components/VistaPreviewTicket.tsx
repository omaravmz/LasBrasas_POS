import { useState } from "react";
import type { ItemBorrador } from "../types/pedido.js";
import { MetodoPago } from "@brasas/shared";
import type { TipoEntrega } from "../services/print.js";
import { BuscadorClienteInline } from "./BuscadorClienteInline.js";
import { IcoClose, IcoPrint } from "./Iconos.js";

export interface OpcionesPedido {
  tipoEntrega: TipoEntrega;
  nombreRecoger?: string;
  horaRecoger?: string;
  direccionEntrega?: string;
  referenciaEntrega?: string;
  clienteId?: string;
}

interface Props {
  items: ItemBorrador[];
  folio: number;
  sucursal: string;
  onCerrar: () => void;
  onConfirmar: (metodoPago: MetodoPago, opciones: OpcionesPedido) => void;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: MetodoPago.EFECTIVO,      etiqueta: "Efectivo" },
  { valor: MetodoPago.TARJETA,       etiqueta: "Tarjeta" },
  { valor: MetodoPago.TRANSFERENCIA, etiqueta: "Transferencia" },
];

const TIPOS: { valor: TipoEntrega; etiqueta: string }[] = [
  { valor: "MOSTRADOR", etiqueta: "Mostrador" },
  { valor: "RECOGER",   etiqueta: "Recoger" },
  { valor: "DOMICILIO", etiqueta: "Domicilio" },
];

const selectorSt = (activo: boolean): React.CSSProperties => ({
  flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid",
  fontFamily: "var(--font)", fontSize: 14, fontWeight: 600, cursor: "pointer",
  borderColor: activo ? "var(--accent)" : "var(--border)",
  background: activo ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "transparent",
  color: activo ? "var(--accent)" : "var(--text-2)",
});

const inputSt: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface-2)",
  fontFamily: "var(--font)", fontSize: 14, color: "var(--text-1)",
  boxSizing: "border-box", outline: "none",
};

const seccionSt: React.CSSProperties = {
  padding: "12px 20px", borderTop: "1px solid var(--border)", background: "var(--surface)",
};

const labelSt: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--text-3)",
  marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em",
  display: "block",
};

export function VistaPreviewTicket({ items, folio, sucursal, onCerrar, onConfirmar }: Props) {
  const [metodoPago, setMetodoPago]         = useState<MetodoPago>(MetodoPago.EFECTIVO);
  const [tipoEntrega, setTipoEntrega]       = useState<TipoEntrega>("MOSTRADOR");
  const [nombreRecoger, setNombreRecoger]   = useState("");
  const [horaRecoger, setHoraRecoger]       = useState("");
  const [direccion, setDireccion]           = useState("");
  const [referencia, setReferencia]         = useState("");
  const [clienteId, setClienteId]           = useState<string | undefined>(undefined);
  const [clienteNombre, setClienteNombre]   = useState<string | undefined>(undefined);
  const [mostrarBuscador, setMostrarBuscador] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  const now   = new Date();
  const fecha = now.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hora  = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });

  function handleTipoEntrega(t: TipoEntrega) {
    setTipoEntrega(t);
    if (t !== "DOMICILIO") { setClienteId(undefined); setClienteNombre(undefined); setDireccion(""); setReferencia(""); }
    if (t !== "RECOGER")   { setNombreRecoger(""); setHoraRecoger(""); }
  }

  function handleConfirmar() {
    const opciones: OpcionesPedido = { tipoEntrega };
    if (tipoEntrega === "RECOGER") {
      if (nombreRecoger.trim()) opciones.nombreRecoger = nombreRecoger.trim();
      if (horaRecoger) opciones.horaRecoger = horaRecoger;
    }
    if (tipoEntrega === "DOMICILIO") {
      if (direccion.trim()) opciones.direccionEntrega = direccion.trim();
      if (referencia.trim()) opciones.referenciaEntrega = referencia.trim();
      if (clienteId) opciones.clienteId = clienteId;
    }
    onConfirmar(metodoPago, opciones);
  }

  return (
    <div className="modal-back" onClick={onCerrar}>
      <div className="modal" style={{ width: 460, maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Vista previa</h2>
          <button className="close" onClick={onCerrar}><IcoClose size={18} /></button>
        </div>

        {/* ── TICKET PREVIEW ── */}
        <div className="modal-body" style={{ background: "var(--surface-2)" }}>
          <div className="ticket">
            <div className="center big">LAS BRASAS</div>
            <div className="center sm">{sucursal} · Culiacán, Sin.</div>
            <hr />
            <div className="row"><span>Folio</span><strong>#{String(folio).padStart(3, "0")}</strong></div>
            <div className="row"><span>Fecha</span><span>{fecha} {hora}</span></div>
            <div className="row"><span>Terminal</span><span>POS-01</span></div>
            {tipoEntrega === "RECOGER" && (
              <>
                <div className="row">
                  <span>Para recoger</span>
                  <span>{nombreRecoger.trim() || "—"}</span>
                </div>
                {horaRecoger && (
                  <div className="row">
                    <span>Hora estimada</span>
                    <span>{horaRecoger}</span>
                  </div>
                )}
              </>
            )}
            {tipoEntrega === "DOMICILIO" && (
              <div className="row">
                <span>Domicilio</span>
                <span>{[direccion, referencia].filter(Boolean).join(", ") || "—"}</span>
              </div>
            )}
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

        {/* ── TIPO DE PEDIDO ── */}
        <div style={seccionSt}>
          <span style={labelSt}>Tipo de pedido</span>
          <div style={{ display: "flex", gap: 8 }}>
            {TIPOS.map(({ valor, etiqueta }) => (
              <button key={valor} style={selectorSt(tipoEntrega === valor)}
                onClick={() => handleTipoEntrega(valor)}>
                {etiqueta}
              </button>
            ))}
          </div>

          {tipoEntrega === "RECOGER" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              <input
                style={inputSt}
                placeholder="Nombre del cliente"
                value={nombreRecoger}
                onChange={(e) => setNombreRecoger(e.target.value)}
              />
              <select
                style={{ ...inputSt, cursor: "pointer" }}
                value={horaRecoger}
                onChange={(e) => setHoraRecoger(e.target.value)}
              >
                <option value="">Hora estimada (opcional)</option>
                {Array.from({ length: 11 }, (_, i) => {
                  const totalMin = 12 * 60 + i * 30;
                  const h = String(Math.floor(totalMin / 60)).padStart(2, "0");
                  const m = String(totalMin % 60).padStart(2, "0");
                  return <option key={i} value={`${h}:${m}`}>{`${h}:${m}`}</option>;
                })}
              </select>
            </div>
          )}

          {tipoEntrega === "DOMICILIO" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              <input
                style={inputSt}
                placeholder="Dirección"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
              />
              <input
                style={inputSt}
                placeholder="Referencia (opcional)"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
              <button
                onClick={() => setMostrarBuscador(true)}
                style={{
                  border: `1.5px solid ${clienteId ? "var(--ok)" : "var(--border)"}`,
                  borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "var(--font)", textAlign: "left",
                  background: clienteId
                    ? "color-mix(in srgb, var(--ok) 10%, var(--surface))"
                    : "var(--surface)",
                  color: clienteId ? "var(--ok)" : "var(--text-2)",
                  width: "100%",
                }}
              >
                {clienteId
                  ? `✓ ${clienteNombre ?? "Cliente asociado"} · Cambiar`
                  : "Buscar cliente"}
              </button>
            </div>
          )}
        </div>

        {/* ── MÉTODO DE PAGO ── */}
        <div style={seccionSt}>
          <span style={labelSt}>Método de pago</span>
          <div style={{ display: "flex", gap: 8 }}>
            {METODOS.map(({ valor, etiqueta }) => (
              <button key={valor} style={selectorSt(metodoPago === valor)}
                onClick={() => setMetodoPago(valor)}>
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onCerrar}>Cerrar</button>
          <button className="btn primary" onClick={handleConfirmar}>
            <IcoPrint size={18} /> Cobrar e imprimir
          </button>
        </div>
      </div>

      {/* Sub-modal buscador de cliente */}
      {mostrarBuscador && (
        <div className="modal-back" onClick={() => setMostrarBuscador(false)}>
          <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Buscar cliente</h2>
              <button className="close" onClick={() => setMostrarBuscador(false)}>
                <IcoClose size={18} />
              </button>
            </div>
            <div className="modal-body">
              <BuscadorClienteInline
                onResuelto={(id, nombre, dir, ref) => {
                  setClienteId(id);
                  setClienteNombre(nombre);
                  setDireccion(dir);
                  setReferencia(ref ?? "");
                  setMostrarBuscador(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
