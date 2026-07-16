import { useState } from "react";
import type { ProductoLocal, VarianteLocal, GrupoCorteLocal } from "../db/types.js";
import { distribuirProporciones, type CorteBorrador } from "../types/pedido.js";
import { precioDeGrupo } from "../services/precio.js";
import { IcoClose, IcoCheck } from "./Iconos.js";

interface Props {
  producto: ProductoLocal;
  gruposCorte: GrupoCorteLocal[];
  onConfirmar: (cortes: CorteBorrador[], cantidad: number, notas: string) => void;
  onCancelar: () => void;
}

const SEG_COLORS = ["#C2410C", "#EA580C", "#FB923C", "#FED7AA"];

const PROP_LABEL: Record<number, string> = {
  1: "100%", 2: "½ · ½", 3: "⅓ · ⅓ · ⅓",
};

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

export function ConfiguradorCortes({ producto, gruposCorte, onConfirmar, onCancelar }: Props) {
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  // El grupo activo se fija con el primer corte elegido y bloquea los del otro grupo:
  // RN-01 (no se mezclan grupos) y, además, el precio del paquete depende de él.
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [notas, setNotas] = useState("");

  const grupos = gruposCorte
    .map((g) => ({
      ...g,
      variantes: producto.variantes.filter((v) => v.grupoCorteId === g.id),
    }))
    .filter((g) => g.variantes.length > 0);

  const isCutEnabled = (v: VarianteLocal) => {
    if (!v.activo) return false;
    if (grupoActivo === null) return true;
    return v.grupoCorteId === grupoActivo;
  };

  const toggleCorte = (v: VarianteLocal) => {
    if (!isCutEnabled(v)) return;
    setSeleccionados((prev) => {
      if (prev.includes(v.id)) {
        const next = prev.filter((id) => id !== v.id);
        if (next.length === 0) setGrupoActivo(null);
        return next;
      }
      if (grupoActivo === null) setGrupoActivo(v.grupoCorteId ?? null);
      return [...prev, v.id];
    });
  };

  const proporciones = distribuirProporciones(seleccionados.length);
  const propLabel = PROP_LABEL[seleccionados.length] ?? `1/${seleccionados.length} × ${seleccionados.length}`;

  const todasVariantes = producto.variantes.filter((v) => v.grupoCorteId != null);
  const variantesGrupoActivo = grupoActivo != null
    ? todasVariantes.filter((v) => v.grupoCorteId === grupoActivo)
    : [];

  // El precio del paquete depende del grupo elegido. Antes de elegir, no hay precio.
  const precio = grupoActivo != null ? precioDeGrupo(producto, grupoActivo) : 0;

  const puedeConfirmar = seleccionados.length > 0;

  const handleConfirmar = () => {
    const cortes: CorteBorrador[] = seleccionados.map((id, i) => {
      const variante = todasVariantes.find((v) => v.id === id)!;
      return { variante, proporcion: proporciones[i]! };
    });
    onConfirmar(cortes, cantidad, notas);
  };

  return (
    <div className="modal-back" onClick={onCancelar}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{producto.nombre}</h2>
            {producto.descripcion && <div className="sub">{producto.descripcion}</div>}
          </div>
          <button className="close" onClick={onCancelar}><IcoClose size={18} /></button>
        </div>

        <div className="modal-body">
          {grupos.map((grupo) => {
            // Cada grupo muestra SU precio: los cortes premium cuestan más, y el cajero
            // tiene que verlo antes de elegir.
            const precioGrupo = precioDeGrupo(producto, grupo.id);

            return (
            <div className="group-block" key={grupo.id}>
              <div className="group-label">
                <span>{grupo.nombre}</span>
                {precioGrupo > 0 && (
                  <span className="group-price">{fmt(precioGrupo)}</span>
                )}
              </div>
              <div className="cuts-grid">
                {grupo.variantes.map((v) => {
                  const isSel = seleccionados.includes(v.id);
                  const enabled = isCutEnabled(v);
                  const cls = [
                    "cut-btn",
                    isSel && "selected",
                    !v.activo && "unavailable",
                    !enabled && v.activo && "disabled-group",
                  ].filter(Boolean).join(" ");

                  return (
                    <button key={v.id} className={cls}
                      disabled={!enabled || !v.activo}
                      onClick={() => toggleCorte(v)}>
                      <span className="nm">{v.nombre}</span>
                      <span className="frac">
                        {isSel ? (propLabel.split(" · ")[0] ?? propLabel) : ""}
                      </span>
                      {!v.activo && <span className="cut-badge agotado">Agotado</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}

          {seleccionados.length > 0 && (
            <div className="mix-preview">
              <div className="mix-bar">
                {seleccionados.map((_, i) => (
                  <div key={i} className="seg"
                    style={{ width: `${100 / seleccionados.length}%`, background: SEG_COLORS[i] ?? "#C2410C" }} />
                ))}
              </div>
              <div className="mix-readout">
                {seleccionados.map((id, i) => {
                  const v = todasVariantes.find((x) => x.id === id)!;
                  return (
                    <span key={id} className="item">
                      <span className="swatch" style={{ background: SEG_COLORS[i] ?? "#C2410C" }} />
                      {v.nombre} · {seleccionados.length === 1 ? "100%" : `1/${seleccionados.length}`}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="row-price" style={{ marginTop: seleccionados.length > 0 ? 18 : 14 }}>
            <label>Cantidad</label>
            <div className="stepper">
              <button onClick={() => setCantidad(Math.max(1, cantidad - 1))}>−</button>
              <div className="v">{cantidad}</div>
              <button onClick={() => setCantidad(cantidad + 1)}>+</button>
            </div>
            <div className="total">
              {puedeConfirmar && precio > 0 ? fmt(precio * cantidad) : "—"}
            </div>
          </div>

          <div className="option-row" style={{ marginTop: 18, marginBottom: 0 }}>
            <label>Notas (opcional)</label>
            <textarea className="notes-input"
              placeholder='ej. "sin cebolla", "carne término medio"'
              value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onCancelar}>Cancelar</button>
          <button className="btn primary" disabled={!puedeConfirmar} onClick={handleConfirmar}>
            <IcoCheck size={18} />
            Agregar al pedido{puedeConfirmar && precio > 0 ? ` · ${fmt(precio * cantidad)}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
