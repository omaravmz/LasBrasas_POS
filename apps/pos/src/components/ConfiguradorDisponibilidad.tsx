import { IcoClose } from "./Iconos.js";
import type { GrupoCorteLocal } from "../db/types.js";

interface CorteUnico {
  nombre: string;
  grupoCorteId: string;
}

interface Props {
  cortes: CorteUnico[];
  gruposCorte: GrupoCorteLocal[];
  overrides: Record<string, boolean>;
  onToggle: (nombre: string) => void;
  onCerrar: () => void;
}

export function ConfiguradorDisponibilidad({ cortes, gruposCorte, overrides, onToggle, onCerrar }: Props) {
  const grupos = gruposCorte
    .map((g) => ({ ...g, cortes: cortes.filter((c) => c.grupoCorteId === g.id) }))
    .filter((g) => g.cortes.length > 0);

  return (
    <div className="modal-back" onClick={onCerrar}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Disponibilidad de cortes</h2>
          </div>
          <button className="close" onClick={onCerrar}><IcoClose size={18} /></button>
        </div>

        <div className="modal-body">
          {grupos.map(({ id, nombre, cortes: cortesGrupo }) => (
            <div className="group-block" key={id}>
              <div className="group-label">
                <span>{nombre}</span>
              </div>
              <div className="cuts-grid">
                {cortesGrupo.map(({ nombre }) => {
                  const disponible = nombre in overrides ? (overrides[nombre] ?? true) : true;
                  return (
                    <button
                      key={nombre}
                      className={`cut-btn ${disponible ? "selected" : "unavailable"}`}
                      onClick={() => onToggle(nombre)}
                    >
                      <span className="nm">{nombre}</span>
                      {!disponible && <span className="cut-badge agotado">Agotado</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
