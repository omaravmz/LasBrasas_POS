import type { CategoriaLocal, ProductoLocal } from "../db/types.js";
import { IcoChevron, IcoChevronLeft, IcoImage } from "./Iconos.js";

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Nivel 0 — tipos de producto (categorías)
// ---------------------------------------------------------------------------
interface TypeMenuProps {
  categorias: CategoriaLocal[];
  countByCat: Record<string, number>;
  onPick: (id: string) => void;
}

export function TypeMenu({ categorias, countByCat, onPick }: TypeMenuProps) {
  return (
    <div className="mosaic-scroll">
      <div className="mosaic-grid">
        {categorias.map((c) => {
          const count = countByCat[c.id] ?? 0;
          return (
            <button key={c.id} className="mosaic-card ed" onClick={() => onPick(c.id)}>
              <div className="mc-photo" aria-hidden><IcoImage size={28} /></div>
              <div className="mc-ed-body">
                <div className="mc-title">{c.nombre}</div>
              </div>
              <div className="mc-ed-foot">
                <span className="mc-count">{count} opcion{count === 1 ? "" : "es"}</span>
                <IcoChevron size={18} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nivel 1 — paquetes de un tipo
// ---------------------------------------------------------------------------
interface PackageViewProps {
  categoria: CategoriaLocal;
  productos: ProductoLocal[];
  onBack: () => void;
  onProductClick: (p: ProductoLocal) => void;
}

export function PackageView({
  categoria, productos, onBack, onProductClick,
}: PackageViewProps) {
  return (
    <>
      <div className="pkg-bar">
        <button className="back-btn" onClick={onBack}>
          <IcoChevronLeft size={18} /> Menú
        </button>
        <div className="pkg-title-wrap">
          <h1 className="pkg-title">{categoria.nombre}</h1>
          <span className="muted small">{productos.length} opcion{productos.length === 1 ? "" : "es"}</span>
        </div>
      </div>

      <div className="mosaic-scroll">
        <div className="prod-grid">
          {productos.map((p) => (
            <button key={p.id} className="prod-card" onClick={() => onProductClick(p)}>
              <div className="photo" aria-hidden><IcoImage size={22} /></div>
              <span className="pname">{p.nombre}</span>
              {p.descripcion && <span className="psub">{p.descripcion}</span>}
              {!p.requiereCorte && p.precio > 0 && (
                <span className="pprice">{fmt(p.precio)}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
