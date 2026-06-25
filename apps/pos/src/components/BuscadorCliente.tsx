import { useState } from "react";
import {
  buscarCliente, crearCliente, agregarDireccion,
  type ClienteBasico, type DireccionBasica,
} from "../services/clienteService.js";

interface Props {
  onSeleccionar: (cliente: ClienteBasico) => void;
  onCerrar: () => void;
}

type Pantalla =
  | { tipo: "buscar" }
  | { tipo: "encontrado"; cliente: ClienteBasico }
  | { tipo: "nuevo"; telefono: string }
  | { tipo: "nueva-direccion"; cliente: ClienteBasico };

export function BuscadorCliente({ onSeleccionar, onCerrar }: Props) {
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: "buscar" });
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    const tel = telefono.trim();
    if (!tel) { setError("Ingresa un número de teléfono"); return; }
    setError(null);
    setCargando(true);
    try {
      const cliente = await buscarCliente(tel);
      if (cliente) {
        setPantalla({ tipo: "encontrado", cliente });
      } else {
        setPantalla({ tipo: "nuevo", telefono: tel });
        setNombre("");
      }
    } catch {
      setError("No se pudo buscar. Verifica la conexión.");
    } finally {
      setCargando(false);
    }
  }

  async function registrar(tel: string) {
    setError(null);
    setCargando(true);
    try {
      const cliente = await crearCliente(
        crypto.randomUUID(), tel,
        nombre.trim() || undefined,
      );
      setPantalla({ tipo: "encontrado", cliente });
    } catch {
      setError("No se pudo registrar el cliente.");
    } finally {
      setCargando(false);
    }
  }

  async function guardarDireccion(cliente: ClienteBasico) {
    const dir = direccion.trim();
    if (!dir) { setError("Ingresa una dirección"); return; }
    setError(null);
    setCargando(true);
    try {
      const nueva = await agregarDireccion(
        cliente.id,
        crypto.randomUUID(),
        dir,
        referencia.trim() || undefined,
      );
      const actualizado: ClienteBasico = {
        ...cliente,
        direcciones: [...cliente.direcciones, nueva],
      };
      setDireccion("");
      setReferencia("");
      setPantalla({ tipo: "encontrado", cliente: actualizado });
    } catch {
      setError("No se pudo guardar la dirección.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 30,
      background: "rgba(0,0,0,.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div style={{
        width: 420, background: "var(--surface)", borderRadius: 14,
        boxShadow: "0 8px 32px rgba(0,0,0,.4)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Buscar cliente</span>
          <button onClick={onCerrar} style={btnIconStyle}>✕</button>
        </div>

        {/* Contenido */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Error */}
          {error && (
            <div style={{ fontSize: 12, color: "var(--danger)", padding: "8px 12px",
              background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
              borderRadius: 8 }}>
              {error}
            </div>
          )}

          {/* === BUSCAR === */}
          {pantalla.tipo === "buscar" && (
            <>
              <label style={labelStyle}>Teléfono</label>
              <input
                type="tel" value={telefono} autoFocus
                onChange={(e) => setTelefono(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void buscar()}
                placeholder="ej. 6671234567"
                style={inputStyle}
              />
              <button onClick={() => void buscar()} disabled={cargando} style={btnPrimaryStyle}>
                {cargando ? "Buscando..." : "Buscar"}
              </button>
            </>
          )}

          {/* === ENCONTRADO === */}
          {pantalla.tipo === "encontrado" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: "var(--ok)", display: "flex", alignItems: "center",
                  justifyContent: "center", fontWeight: 700, fontSize: 16, color: "#fff",
                }}>
                  {(pantalla.cliente.nombre ?? pantalla.cliente.telefono).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {pantalla.cliente.nombre ?? "Sin nombre"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>{pantalla.cliente.telefono}</div>
                </div>
              </div>

              {/* Direcciones */}
              {pantalla.cliente.direcciones.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={labelStyle}>Direcciones</span>
                  {pantalla.cliente.direcciones.map((d) => (
                    <div key={d.id} style={{
                      padding: "8px 12px", borderRadius: 8,
                      border: `1px solid ${d.esPrincipal ? "var(--ok)" : "var(--border)"}`,
                      background: d.esPrincipal
                        ? "color-mix(in srgb, var(--ok) 8%, var(--surface))"
                        : "var(--bg)",
                      fontSize: 13,
                    }}>
                      <div style={{ fontWeight: d.esPrincipal ? 600 : 400 }}>{d.direccion}</div>
                      {d.referencia && (
                        <div style={{ fontSize: 11, color: "var(--text-3)" }}>{d.referencia}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setPantalla({ tipo: "nueva-direccion", cliente: pantalla.cliente })}
                style={btnSecondaryStyle}
              >
                + Agregar dirección
              </button>

              <button
                onClick={() => onSeleccionar(pantalla.cliente)}
                style={btnPrimaryStyle}
              >
                Asociar a este pedido
              </button>

              <button
                onClick={() => { setPantalla({ tipo: "buscar" }); setTelefono(""); }}
                style={btnGhostStyle}
              >
                Buscar otro
              </button>
            </>
          )}

          {/* === NUEVO CLIENTE === */}
          {pantalla.tipo === "nuevo" && (
            <>
              <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                No se encontró un cliente con el número <strong>{pantalla.telefono}</strong>.
              </div>
              <label style={labelStyle}>Nombre (opcional)</label>
              <input
                type="text" value={nombre} autoFocus
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void registrar(pantalla.telefono)}
                placeholder="Nombre del cliente"
                style={inputStyle}
              />
              <button
                onClick={() => void registrar(pantalla.telefono)}
                disabled={cargando}
                style={btnPrimaryStyle}
              >
                {cargando ? "Registrando..." : "Registrar cliente"}
              </button>
              <button
                onClick={() => { setPantalla({ tipo: "buscar" }); setTelefono(""); }}
                style={btnGhostStyle}
              >
                Cancelar
              </button>
            </>
          )}

          {/* === NUEVA DIRECCIÓN === */}
          {pantalla.tipo === "nueva-direccion" && (
            <>
              <label style={labelStyle}>Dirección</label>
              <input
                type="text" value={direccion} autoFocus
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Calle, colonia, número"
                style={inputStyle}
              />
              <label style={labelStyle}>Referencia (opcional)</label>
              <input
                type="text" value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Entre calles, color de la casa..."
                style={inputStyle}
              />
              <button
                onClick={() => void guardarDireccion(pantalla.cliente)}
                disabled={cargando}
                style={btnPrimaryStyle}
              >
                {cargando ? "Guardando..." : "Guardar dirección"}
              </button>
              <button
                onClick={() => setPantalla({ tipo: "encontrado", cliente: pantalla.cliente })}
                style={btnGhostStyle}
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Estilos reutilizables
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
  textTransform: "uppercase", color: "var(--text-3)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--bg)",
  padding: "0 12px", fontSize: 14, color: "var(--text)",
  fontFamily: "var(--font)", boxSizing: "border-box",
  outline: "none",
};

const btnPrimaryStyle: React.CSSProperties = {
  width: "100%", height: 42, borderRadius: 10, border: "none",
  background: "var(--accent)", color: "#fff",
  fontFamily: "var(--font)", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

const btnSecondaryStyle: React.CSSProperties = {
  width: "100%", height: 38, borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--text-2)", fontFamily: "var(--font)", fontSize: 13,
  fontWeight: 600, cursor: "pointer",
};

const btnGhostStyle: React.CSSProperties = {
  width: "100%", height: 36, borderRadius: 8, border: "none",
  background: "transparent", color: "var(--text-3)",
  fontFamily: "var(--font)", fontSize: 13, cursor: "pointer",
};

const btnIconStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  border: "1px solid var(--border)", background: "transparent",
  color: "var(--text-3)", cursor: "pointer", fontFamily: "var(--font)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
