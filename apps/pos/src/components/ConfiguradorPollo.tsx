import { useState } from "react";
import type { ProductoLocal } from "../db/types.js";
import { IcoClose, IcoCheck } from "./Iconos.js";

interface Props {
  producto: ProductoLocal;
  // Precio unitario del extra "Papas Fritas". El total mostrado en el botón suma el pollo
  // más las papas, para que el cajero vea lo que realmente va al pedido.
  precioPapas: number;
  onConfirmar: (cantidadPollo: number, notas: string, cantidadPapas: number | null) => void;
  onCancelar: () => void;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

export function ConfiguradorPollo({ producto, precioPapas, onConfirmar, onCancelar }: Props) {
  const [cantidad, setCantidad] = useState(1);
  const [conPapas, setConPapas] = useState(false);
  const [cantidadPapas, setCantidadPapas] = useState(1);
  const [notas, setNotas] = useState("");

  const subtotalPapas = conPapas ? precioPapas * cantidadPapas : 0;
  const totalPedido = producto.precio * cantidad + subtotalPapas;

  const handleConfirmar = () => {
    onConfirmar(cantidad, notas, conPapas ? cantidadPapas : null);
  };

  const togglePapas = () => {
    setConPapas((v) => {
      if (!v) setCantidadPapas(1);
      return !v;
    });
  };

  return (
    <div className="modal-back" onClick={onCancelar}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{producto.nombre}</h2>
            {producto.precio > 0 && (
              <div className="sub">{fmt(producto.precio)}</div>
            )}
          </div>
          <button className="close" onClick={onCancelar}><IcoClose size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Cantidad de pollo */}
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

          {/* Toggle papas */}
          <div className="option-row" style={{ marginTop: 18 }}>
            <label>Extras</label>
            <button
              className={`opt-btn ${conPapas ? "selected" : ""}`}
              style={{ width: "100%", justifyContent: "center" }}
              onClick={togglePapas}
            >
              <span>Extra Papas</span>
              <span className="sub">{conPapas ? "incluido" : "opcional"}</span>
            </button>
          </div>

          {/* Cantidad de papas (solo si está activo) */}
          {conPapas && (
            <div className="row-price" style={{ marginTop: 12 }}>
              <label>Cantidad papas</label>
              <div className="stepper">
                <button onClick={() => setCantidadPapas(Math.max(1, cantidadPapas - 1))}>−</button>
                <div className="v">{cantidadPapas}</div>
                <button onClick={() => setCantidadPapas(cantidadPapas + 1)}>+</button>
              </div>
              <div className="total">{subtotalPapas > 0 ? fmt(subtotalPapas) : ""}</div>
            </div>
          )}

          {/* Notas */}
          <div className="option-row" style={{ marginTop: 18, marginBottom: 0 }}>
            <label>Notas (opcional)</label>
            <textarea
              className="notes-input"
              placeholder='ej. "para llevar", "sin picante"'
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onCancelar}>Cancelar</button>
          <button className="btn primary" onClick={handleConfirmar}>
            <IcoCheck size={18} />
            Agregar{totalPedido > 0 ? ` · ${fmt(totalPedido)}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
