import { IcoClose } from "./Iconos.js";

interface CorteUnico {
  nombre: string;
  grupoPrecio: number;
}

interface Props {
  cortes: CorteUnico[];
  overrides: Record<string, boolean>;
  onToggle: (nombre: string) => void;
  onCerrar: () => void;
}

export function ConfiguradorDisponibilidad({ cortes, overrides, onToggle, onCerrar }: Props) {
  const grupos = [1, 2].map((g) => ({
    num: g,
    cortes: cortes.filter((c) => c.grupoPrecio === g),
  })).filter((g) => g.cortes.length > 0);

  return (
    <div className="modal-back" onClick={onCerrar}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Disponibilidad de cortes</h2>
            <div className="sub">Aplica a todos los paquetes de carne</div>
          </div>
          <button className="close" onClick={onCerrar}><IcoClose size={18} /></button>
        </div>

        <div className="modal-body">
          {grupos.map(({ num, cortes: cortesGrupo }) => (
            <div className="group-block" key={num}>
              <div className="group-label">
                <span>Grupo {num}</span>
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
                      <span className="frac">{disponible ? "✓" : "✗"}</span>
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
