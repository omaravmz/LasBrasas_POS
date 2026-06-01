import { useState } from "react";
import { IcoClose } from "./Iconos.js";

interface Props {
  nombreItem: string;
  notaActual: string;
  onGuardar: (nota: string) => void;
  onCancelar: () => void;
}

export function EditarNota({ nombreItem, notaActual, onGuardar, onCancelar }: Props) {
  const [nota, setNota] = useState(notaActual);

  return (
    <div className="modal-back" onClick={onCancelar}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Nota del producto</h2>
            <div className="sub">{nombreItem}</div>
          </div>
          <button className="close" onClick={onCancelar}><IcoClose size={18} /></button>
        </div>
        <div className="modal-body">
          <textarea className="notes-input" autoFocus style={{ minHeight: 120 }}
            placeholder='ej. "sin cebolla", "carne bien cocida"'
            value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onCancelar}>Cancelar</button>
          <button className="btn primary" onClick={() => onGuardar(nota)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
