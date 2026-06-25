import { useState } from "react";
import type { ProductoLocal } from "../db/types.js";
import { IcoClose, IcoCheck } from "./Iconos.js";

interface Opcion { id: string; label: string; sub?: string }

interface Props {
  producto: ProductoLocal;
  /** Si es "aderezo" muestra Ranch/BBQ/Buffalo. Si es "torta" muestra Sencilla/Con papas. Omitir para solo cantidad+notas. */
  variantes?: "aderezo" | "torta" | undefined;
  onConfirmar: (opcionId: string | null, cantidad: number, notas: string) => void;
  onCancelar: () => void;
}

const ADEREZOS: Opcion[] = [
  { id: "ranch",   label: "Ranch" },
  { id: "bbq",     label: "BBQ" },
  { id: "buffalo", label: "Buffalo" },
];
const TORTA_OPTS: Opcion[] = [
  { id: "sencilla", label: "Sencilla", sub: "sin papas" },
  { id: "con-papas", label: "Con papas", sub: "+ 175 gr" },
];

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

export function ConfiguradorRapido({ producto, variantes, onConfirmar, onCancelar }: Props) {
  const [opcion, setOpcion] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [notas, setNotas] = useState("");

  const opciones: Opcion[] = variantes === "aderezo" ? ADEREZOS
    : variantes === "torta" ? TORTA_OPTS : [];

  const necesitaOpcion = opciones.length > 0;
  const puedeConfirmar = !necesitaOpcion || opcion !== null;

  return (
    <div className="modal-back" onClick={onCancelar}>
      <div className={`modal ${opciones.length === 0 ? "narrow" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{producto.nombre}</h2>
            <div className="sub">
              {producto.descripcion ? `${producto.descripcion} · ` : ""}
              {producto.precio > 0 ? fmt(producto.precio) : ""}
            </div>
          </div>
          <button className="close" onClick={onCancelar}><IcoClose size={18} /></button>
        </div>

        <div className="modal-body">
          {necesitaOpcion && (
            <div className="option-row">
              <label>{variantes === "aderezo" ? "Aderezo" : "Presentación"}</label>
              <div className={`opt-grid ${opciones.length === 3 ? "three" : "two"}`}>
                {opciones.map((o) => (
                  <button key={o.id} className={`opt-btn ${opcion === o.id ? "selected" : ""}`}
                    onClick={() => setOpcion(o.id)}>
                    <span>{o.label}</span>
                    {o.sub && <span className="sub">{o.sub}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="row-price">
            <label>Cantidad</label>
            <div className="stepper">
              <button onClick={() => setCantidad(Math.max(1, cantidad - 1))}>−</button>
              <div className="v">{cantidad}</div>
              <button onClick={() => setCantidad(cantidad + 1)}>+</button>
            </div>
            <div className="total">
              {producto.precio > 0 ? fmt(producto.precio * cantidad) : ""}
            </div>
          </div>

          <div className="option-row" style={{ marginTop: 18, marginBottom: 0 }}>
            <label>Notas (opcional)</label>
            <textarea className="notes-input"
              placeholder='ej. "para llevar", "sin picante"'
              value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onCancelar}>Cancelar</button>
          <button className="btn primary" disabled={!puedeConfirmar}
            onClick={() => onConfirmar(opcion, cantidad, notas)}>
            <IcoCheck size={18} /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
