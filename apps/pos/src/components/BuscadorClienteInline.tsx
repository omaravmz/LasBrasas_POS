import { useState } from "react";
import {
  buscarCliente, crearCliente, agregarDireccion,
  type ClienteBasico,
} from "../services/clienteService.js";

interface Props {
  onResuelto: (clienteId: string, nombre: string | undefined, direccion: string, referencia?: string) => void;
}

type Pantalla =
  | { tipo: "buscar" }
  | { tipo: "encontrado"; cliente: ClienteBasico }
  | { tipo: "nuevo"; telefono: string }
  | { tipo: "nueva-direccion"; cliente: ClienteBasico };

const inputSt: React.CSSProperties = {
  flex: 1, height: 36, borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--surface)",
  padding: "0 10px", fontSize: 13, color: "var(--text-1)",
  fontFamily: "var(--font)", boxSizing: "border-box", outline: "none",
};
const btnPrimSt: React.CSSProperties = {
  padding: "0 14px", height: 36, borderRadius: 8, border: "none",
  background: "var(--accent)", color: "#fff",
  fontFamily: "var(--font)", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnGhostSt: React.CSSProperties = {
  flex: 1, height: 34, borderRadius: 8,
  border: "1px solid var(--border)", background: "transparent",
  color: "var(--text-2)", fontFamily: "var(--font)", fontSize: 13, cursor: "pointer",
};

export function BuscadorClienteInline({ onResuelto }: Props) {
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: "buscar" });
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [dirInput, setDirInput] = useState("");
  const [refInput, setRefInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirSeleccionada, setDirSeleccionada] = useState<string | null>(null);

  async function buscar() {
    const tel = telefono.trim();
    if (!tel) { setError("Ingresa un número de teléfono"); return; }
    setError(null);
    setCargando(true);
    try {
      const cliente = await buscarCliente(tel);
      if (cliente) {
        const principal = cliente.direcciones.find((d) => d.esPrincipal) ?? cliente.direcciones[0];
        setPantalla({ tipo: "encontrado", cliente });
        if (principal) {
          setDirSeleccionada(principal.id);
          onResuelto(cliente.id, cliente.nombre, principal.direccion, principal.referencia);
        } else {
          onResuelto(cliente.id, cliente.nombre, "");
        }
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
      const cliente = await crearCliente(crypto.randomUUID(), tel, nombre.trim() || undefined);
      setDirInput("");
      setRefInput("");
      setPantalla({ tipo: "nueva-direccion", cliente });
    } catch {
      setError("No se pudo registrar el cliente.");
    } finally {
      setCargando(false);
    }
  }

  async function guardarDireccion(cliente: ClienteBasico) {
    const dir = dirInput.trim();
    if (!dir) { setError("Ingresa una dirección"); return; }
    setError(null);
    setCargando(true);
    try {
      const nueva = await agregarDireccion(
        cliente.id, crypto.randomUUID(), dir, refInput.trim() || undefined,
      );
      const actualizado: ClienteBasico = { ...cliente, direcciones: [...cliente.direcciones, nueva] };
      setDirInput("");
      setRefInput("");
      setDirSeleccionada(nueva.id);
      setPantalla({ tipo: "encontrado", cliente: actualizado });
      onResuelto(cliente.id, cliente.nombre, nueva.direccion, nueva.referencia);
    } catch {
      setError("No se pudo guardar la dirección.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error && (
        <div style={{
          fontSize: 12, color: "var(--danger)", padding: "6px 10px",
          background: "color-mix(in srgb, var(--danger) 10%, var(--surface))", borderRadius: 6,
        }}>
          {error}
        </div>
      )}

      {/* ── BUSCAR ── */}
      {pantalla.tipo === "buscar" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="tel" value={telefono} placeholder="Teléfono del cliente"
            onChange={(e) => setTelefono(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void buscar(); }}
            style={inputSt}
          />
          <button onClick={() => void buscar()} disabled={cargando} style={btnPrimSt}>
            {cargando ? "…" : "Buscar"}
          </button>
        </div>
      )}

      {/* ── ENCONTRADO ── */}
      {pantalla.tipo === "encontrado" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {pantalla.cliente.nombre ?? pantalla.cliente.telefono}
              {pantalla.cliente.nombre && (
                <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: 6 }}>
                  {pantalla.cliente.telefono}
                </span>
              )}
            </div>
            <button
              onClick={() => { setPantalla({ tipo: "buscar" }); setTelefono(""); setDirSeleccionada(null); }}
              style={{ background: "none", border: "none", fontSize: 12, color: "var(--text-3)", cursor: "pointer" }}
            >
              Cambiar
            </button>
          </div>

          {pantalla.cliente.direcciones.map((d) => (
            <button key={d.id}
              onClick={() => { setDirSeleccionada(d.id); onResuelto(pantalla.cliente.id, pantalla.cliente.nombre, d.direccion, d.referencia); }}
              style={{
                textAlign: "left", padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                border: `1.5px solid ${dirSeleccionada === d.id ? "var(--accent)" : "var(--border)"}`,
                background: dirSeleccionada === d.id
                  ? "color-mix(in srgb, var(--accent) 8%, var(--surface))"
                  : "var(--surface)",
                fontFamily: "var(--font)", fontSize: 13,
              }}
            >
              {[d.direccion, d.referencia].filter(Boolean).join(", ")}
            </button>
          ))}

          <button
            onClick={() => { setDirInput(""); setRefInput(""); setPantalla({ tipo: "nueva-direccion", cliente: pantalla.cliente }); }}
            style={{
              background: "none", border: "1px dashed var(--border)", borderRadius: 8,
              padding: "7px 10px", fontSize: 13, color: "var(--text-2)",
              cursor: "pointer", fontFamily: "var(--font)",
            }}
          >
            + Nueva dirección
          </button>
        </>
      )}

      {/* ── NUEVO CLIENTE ── */}
      {pantalla.tipo === "nuevo" && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>
            No se encontró el número <strong>{pantalla.telefono}</strong>.
          </div>
          <input
            type="text" value={nombre} placeholder="Nombre (opcional)"
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void registrar(pantalla.telefono); }}
            style={{ ...inputSt, width: "100%" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={btnGhostSt}
              onClick={() => { setPantalla({ tipo: "buscar" }); setTelefono(""); }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void registrar(pantalla.telefono)} disabled={cargando}
              style={{ ...btnPrimSt, flex: 2, width: "auto", padding: "0" }}
            >
              {cargando ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </>
      )}

      {/* ── NUEVA DIRECCIÓN ── */}
      {pantalla.tipo === "nueva-direccion" && (
        <>
          <input
            type="text" value={dirInput} placeholder="Dirección (calle, colonia, número)"
            onChange={(e) => setDirInput(e.target.value)}
            style={{ ...inputSt, width: "100%" }}
          />
          <input
            type="text" value={refInput} placeholder="Referencia (opcional)"
            onChange={(e) => setRefInput(e.target.value)}
            style={{ ...inputSt, width: "100%" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={btnGhostSt}
              onClick={() => setPantalla({ tipo: "encontrado", cliente: pantalla.cliente })}
            >
              Cancelar
            </button>
            <button
              onClick={() => void guardarDireccion(pantalla.cliente)} disabled={cargando}
              style={{ ...btnPrimSt, flex: 2, width: "auto", padding: "0" }}
            >
              {cargando ? "Guardando…" : "Guardar dirección"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
