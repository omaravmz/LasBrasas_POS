import { useEffect, useState } from "react";
import {
  getEstadoCaja, abrirDia, cerrarDia,
  type EstadoCaja, type CierreInfo, type GastoInput, type EntradaInput,
} from "../services/cajaService.js";

interface Props {
  sucursalNombre: string;
  onCerrar: () => void;
}

// ---------------------------------------------------------------------------
// Helpers de formato

function peso(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fechaLegible(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mazatlan",
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function generarReporte(
  estado: EstadoCaja,
  cierre: CierreInfo,
  sucursalNombre: string,
): string {
  const totalGastos = cierre.gastos.reduce((s, g) => s + g.monto, 0);
  const totalEntradas = cierre.entradas.reduce((s, e) => s + e.monto, 0);
  const ef = cierre.fondoInicial + cierre.ventasEfectivo - cierre.reembolsosEfectivo;
  const difSign = cierre.diferencia >= 0 ? "SOBRA" : "FALTA";

  const lines = [
    `🥩 Las Brasas — ${sucursalNombre}`,
    `📅 Corte ${estado.fecha}  |  ${fechaLegible(cierre.cerradoEn)}`,
    "",
    "═══ VENTAS DEL DÍA ═══════════════",
    `Efectivo:       ${peso(cierre.ventasEfectivo)}`,
    `Tarjeta:        ${peso(cierre.ventasTarjeta)}`,
    `Transferencia:  ${peso(cierre.ventasTransfer)}`,
    `TOTAL VENTAS:   ${peso(cierre.totalVentas)}`,
    ...(cierre.reembolsosEfectivo > 0
      ? [`Reembolsos ef:  -${peso(cierre.reembolsosEfectivo)}`]
      : []),
    "",
    "═══ CAJA ══════════════════════════",
    `Fondo inicial:  ${peso(cierre.fondoInicial)}`,
    `Ef. esperado:   ${peso(ef)}`,
    `Conteo físico:  ${peso(cierre.conteoFisico)}`,
    `Diferencia:     ${cierre.diferencia >= 0 ? "+" : ""}${peso(cierre.diferencia)} (${difSign})`,
    ...(totalGastos > 0
      ? ["", "═══ GASTOS ═════════════════════════",
          ...cierre.gastos.map((g) => `• ${g.concepto}: ${peso(g.monto)}`),
          `TOTAL GASTOS:   ${peso(totalGastos)}`]
      : []),
    ...(totalEntradas > 0
      ? ["", "═══ ENTRADAS ═══════════════════════",
          ...cierre.entradas.map((e) => `• ${e.concepto}: ${peso(e.monto)}`),
          `TOTAL ENTRADAS: ${peso(totalEntradas)}`]
      : []),
    ...(cierre.notas ? ["", `📝 ${cierre.notas}`] : []),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Componente principal

export function VistaCaja({ sucursalNombre, onCerrar }: Props) {
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      setEstado(await getEstadoCaja());
    } catch {
      setError("No se pudo cargar el estado de caja. ¿Hay conexión?");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20,
      background: "var(--bg)", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        height: 56, flexShrink: 0, display: "flex", alignItems: "center",
        gap: 16, padding: "0 20px", background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
      }}>
        <button onClick={onCerrar} style={btnBorderStyle}>← Volver</button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Corte de caja</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{sucursalNombre}</span>
        {estado && (
          <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>
            {estado.fecha}
          </span>
        )}
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24 }}>
        {error && (
          <div style={{ color: "var(--danger)", marginBottom: 16, fontSize: 13 }}>{error}</div>
        )}
        {cargando && (
          <div style={{ color: "var(--text-3)", fontSize: 14 }}>Cargando...</div>
        )}
        {!cargando && estado && (
          <>
            {!estado.apertura && <PantallaApertura onAbierto={cargar} />}
            {estado.apertura && !estado.cierre && estado.ventasDelDia && (
              <PantallaCierre
                fecha={estado.fecha}
                apertura={estado.apertura}
                ventas={estado.ventasDelDia}
                onCerrado={cargar}
              />
            )}
            {estado.cierre && (
              <PantallaResumen
                estado={estado}
                cierre={estado.cierre}
                sucursalNombre={sucursalNombre}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla: Apertura

function PantallaApertura({ onAbierto }: { onAbierto: () => void }) {
  const [fondo, setFondo] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    const n = parseFloat(fondo);
    if (isNaN(n) || n < 0) { setError("Ingresa un fondo inicial válido (puede ser 0)"); return; }
    setError(null);
    setEnviando(true);
    try {
      await abrirDia(crypto.randomUUID(), n, notas.trim() || undefined);
      onAbierto();
    } catch {
      setError("No se pudo registrar la apertura. Verifica la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ maxWidth: 400 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700 }}>Apertura del día</h2>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-3)" }}>
        Registra el fondo de caja con el que arranca el día.
      </p>

      {error && <ErrorBanner mensaje={error} />}

      <Field label="Fondo inicial ($)">
        <input
          type="number" min="0" step="0.01" value={fondo} autoFocus
          onChange={(e) => setFondo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void abrir()}
          placeholder="0.00"
          style={inputStyle}
        />
      </Field>

      <Field label="Notas (opcional)">
        <input
          type="text" value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Ej. Fondo reducido por día festivo"
          style={inputStyle}
        />
      </Field>

      <button onClick={() => void abrir()} disabled={enviando} style={{ ...btnPrimaryStyle, marginTop: 8 }}>
        {enviando ? "Registrando..." : "Abrir día"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla: Cierre

interface CierreProps {
  fecha: string;
  apertura: { fondoInicial: number; notas: string | null };
  ventas: NonNullable<EstadoCaja["ventasDelDia"]>;
  onCerrado: () => void;
}

function PantallaCierre({ fecha: _fecha, apertura, ventas, onCerrado }: CierreProps) {
  const [conteo, setConteo] = useState("");
  const [notas, setNotas] = useState("");
  const [gastos, setGastos] = useState<GastoInput[]>([]);
  const [nuevoConceptoGasto, setNuevoConceptoGasto] = useState("");
  const [nuevoMontoGasto, setNuevoMontoGasto] = useState("");
  const [entradas, setEntradas] = useState<EntradaInput[]>([]);
  const [nuevoConceptoEntrada, setNuevoConceptoEntrada] = useState("");
  const [nuevoMontoEntrada, setNuevoMontoEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const efectivoEsperado = apertura.fondoInicial + ventas.ventasEfectivo - ventas.reembolsosEfectivo;
  const conteoNum = parseFloat(conteo);
  const diferencia = isNaN(conteoNum) ? null : conteoNum - efectivoEsperado;
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const totalEntradas = entradas.reduce((s, e) => s + e.monto, 0);

  function agregarGasto() {
    const m = parseFloat(nuevoMontoGasto);
    if (!nuevoConceptoGasto.trim() || isNaN(m) || m <= 0) return;
    setGastos((prev) => [...prev, { id: crypto.randomUUID(), concepto: nuevoConceptoGasto.trim(), monto: m }]);
    setNuevoConceptoGasto("");
    setNuevoMontoGasto("");
  }

  function quitarGasto(id: string) {
    setGastos((prev) => prev.filter((g) => g.id !== id));
  }

  function agregarEntrada() {
    const m = parseFloat(nuevoMontoEntrada);
    if (!nuevoConceptoEntrada.trim() || isNaN(m) || m <= 0) return;
    setEntradas((prev) => [...prev, { id: crypto.randomUUID(), concepto: nuevoConceptoEntrada.trim(), monto: m }]);
    setNuevoConceptoEntrada("");
    setNuevoMontoEntrada("");
  }

  function quitarEntrada(id: string) {
    setEntradas((prev) => prev.filter((e) => e.id !== id));
  }

  async function cerrar() {
    if (isNaN(conteoNum) || conteoNum < 0) {
      setError("Ingresa el conteo físico de caja");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await cerrarDia(crypto.randomUUID(), conteoNum, gastos, entradas, notas.trim() || undefined);
      onCerrado();
    } catch {
      setError("No se pudo registrar el cierre. Verifica la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, maxWidth: 900 }}>

      {/* Columna izquierda: resumen de ventas */}
      <div>
        <SectionTitle>Ventas del día</SectionTitle>
        <FilaResumen label="Pedidos" valor={String(ventas.numPedidos)} mono={false} />
        <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
        <FilaResumen label="Efectivo" valor={peso(ventas.ventasEfectivo)} />
        <FilaResumen label="Tarjeta" valor={peso(ventas.ventasTarjeta)} />
        <FilaResumen label="Transferencia" valor={peso(ventas.ventasTransfer)} />
        <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
        <FilaResumen label="Total ventas" valor={peso(ventas.totalVentas)} bold />
        {ventas.reembolsosEfectivo > 0 && (
          <FilaResumen label="Reembolsos efectivo" valor={`-${peso(ventas.reembolsosEfectivo)}`} color="var(--danger)" />
        )}

        <div style={{ height: 24 }} />
        <SectionTitle>Caja esperada</SectionTitle>
        <FilaResumen label="Fondo inicial" valor={peso(apertura.fondoInicial)} />
        <FilaResumen label="+ Ventas efectivo" valor={peso(ventas.ventasEfectivo)} />
        {ventas.reembolsosEfectivo > 0 && (
          <FilaResumen label="− Reembolsos" valor={`-${peso(ventas.reembolsosEfectivo)}`} color="var(--danger)" />
        )}
        <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
        <FilaResumen label="Esperado en caja" valor={peso(efectivoEsperado)} bold />
      </div>

      {/* Columna derecha: formulario de cierre */}
      <div>
        {error && <ErrorBanner mensaje={error} />}

        <SectionTitle>Conteo físico</SectionTitle>
        <input
          type="number" min="0" step="0.01" value={conteo} autoFocus
          onChange={(e) => setConteo(e.target.value)}
          placeholder="0.00"
          style={{ ...inputStyle, marginBottom: 8 }}
        />

        {diferencia !== null && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 16,
            background: diferencia === 0
              ? "color-mix(in srgb, var(--ok) 10%, var(--surface))"
              : Math.abs(diferencia) < 10
                ? "color-mix(in srgb, var(--warn) 10%, var(--surface))"
                : "color-mix(in srgb, var(--danger) 10%, var(--surface))",
            border: `1px solid ${diferencia === 0 ? "var(--ok)" : Math.abs(diferencia) < 10 ? "var(--warn)" : "var(--danger)"}`,
            fontSize: 14, fontWeight: 700,
            color: diferencia === 0 ? "var(--ok)" : Math.abs(diferencia) < 10 ? "var(--warn)" : "var(--danger)",
          }}>
            {diferencia === 0
              ? "✓ Caja cuadra exacto"
              : diferencia > 0
                ? `Sobran ${peso(diferencia)}`
                : `Faltan ${peso(Math.abs(diferencia))}`}
          </div>
        )}

        {/* Gastos */}
        <SectionTitle>Gastos del día</SectionTitle>
        {gastos.length > 0 && (
          <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {gastos.map((g) => (
              <div key={g.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", background: "var(--bg)", borderRadius: 6,
                border: "1px solid var(--border)", fontSize: 13,
              }}>
                <span style={{ flex: 1 }}>{g.concepto}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{peso(g.monto)}</span>
                <button onClick={() => quitarGasto(g.id)} style={btnIconSmall}>✕</button>
              </div>
            ))}
            <div style={{ fontSize: 12, color: "var(--text-3)", textAlign: "right", paddingRight: 32 }}>
              Total: {peso(totalGastos)}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input
            type="text" value={nuevoConceptoGasto}
            onChange={(e) => setNuevoConceptoGasto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregarGasto()}
            placeholder="Concepto"
            style={{ ...inputStyle, flex: 2 }}
          />
          <input
            type="number" min="0" value={nuevoMontoGasto}
            onChange={(e) => setNuevoMontoGasto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregarGasto()}
            placeholder="$0"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={agregarGasto} style={btnBorderStyle}>+</button>
        </div>

        {/* Entradas */}
        <SectionTitle>Entradas del día</SectionTitle>
        {entradas.length > 0 && (
          <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {entradas.map((e) => (
              <div key={e.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", background: "var(--bg)", borderRadius: 6,
                border: "1px solid var(--border)", fontSize: 13,
              }}>
                <span style={{ flex: 1 }}>{e.concepto}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{peso(e.monto)}</span>
                <button onClick={() => quitarEntrada(e.id)} style={btnIconSmall}>✕</button>
              </div>
            ))}
            <div style={{ fontSize: 12, color: "var(--ok)", textAlign: "right", paddingRight: 32 }}>
              Total: {peso(totalEntradas)}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <input
            type="text" value={nuevoConceptoEntrada}
            onChange={(e) => setNuevoConceptoEntrada(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregarEntrada()}
            placeholder="Concepto"
            style={{ ...inputStyle, flex: 2 }}
          />
          <input
            type="number" min="0" value={nuevoMontoEntrada}
            onChange={(e) => setNuevoMontoEntrada(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregarEntrada()}
            placeholder="$0"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={agregarEntrada} style={btnBorderStyle}>+</button>
        </div>

        <Field label="Notas (opcional)">
          <textarea
            value={notas} onChange={(e) => setNotas(e.target.value)}
            rows={2} placeholder="Observaciones del cierre..."
            style={{ ...inputStyle, height: "auto", resize: "none", padding: "8px 12px" }}
          />
        </Field>

        <button
          onClick={() => void cerrar()}
          disabled={enviando}
          style={{ ...btnPrimaryStyle, marginTop: 16, background: "var(--danger)" }}
        >
          {enviando ? "Cerrando..." : "Cerrar día"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pantalla: Resumen post-cierre

function PantallaResumen({
  estado, cierre, sucursalNombre,
}: {
  estado: EstadoCaja;
  cierre: CierreInfo;
  sucursalNombre: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const totalGastos = cierre.gastos.reduce((s, g) => s + g.monto, 0);
  const totalEntradas = cierre.entradas.reduce((s, e) => s + e.monto, 0);

  function copiar() {
    void navigator.clipboard.writeText(generarReporte(estado, cierre, sucursalNombre)).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{
        padding: "16px 20px", borderRadius: 10, marginBottom: 24,
        background: "color-mix(in srgb, var(--ok) 10%, var(--surface))",
        border: "1px solid var(--ok)", display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>✓</span>
        <div>
          <div style={{ fontWeight: 700, color: "var(--ok)" }}>Día cerrado</div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>{fechaLegible(cierre.cerradoEn)}</div>
        </div>
        <button onClick={copiar} style={{ ...btnBorderStyle, marginLeft: "auto" }}>
          {copiado ? "✓ Copiado" : "Copiar resumen"}
        </button>
      </div>

      <SectionTitle>Ventas</SectionTitle>
      <FilaResumen label="Efectivo" valor={peso(cierre.ventasEfectivo)} />
      <FilaResumen label="Tarjeta" valor={peso(cierre.ventasTarjeta)} />
      <FilaResumen label="Transferencia" valor={peso(cierre.ventasTransfer)} />
      <FilaResumen label="Total ventas" valor={peso(cierre.totalVentas)} bold />
      {cierre.reembolsosEfectivo > 0 && (
        <FilaResumen label="Reembolsos efectivo" valor={`-${peso(cierre.reembolsosEfectivo)}`} color="var(--danger)" />
      )}

      <div style={{ height: 20 }} />
      <SectionTitle>Conciliación</SectionTitle>
      <FilaResumen label="Fondo inicial" valor={peso(cierre.fondoInicial)} />
      <FilaResumen label="Conteo físico" valor={peso(cierre.conteoFisico)} />
      <FilaResumen
        label="Diferencia"
        valor={`${cierre.diferencia >= 0 ? "+" : ""}${peso(cierre.diferencia)}`}
        bold
        color={cierre.diferencia === 0 ? "var(--ok)" : Math.abs(cierre.diferencia) < 10 ? "var(--warn)" : "var(--danger)"}
      />

      {cierre.gastos.length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <SectionTitle>Gastos</SectionTitle>
          {cierre.gastos.map((g) => (
            <FilaResumen key={g.id} label={g.concepto} valor={peso(g.monto)} />
          ))}
          <FilaResumen label="Total gastos" valor={peso(totalGastos)} bold />
        </>
      )}

      {cierre.entradas.length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <SectionTitle>Entradas</SectionTitle>
          {cierre.entradas.map((e) => (
            <FilaResumen key={e.id} label={e.concepto} valor={peso(e.monto)} color="var(--ok)" />
          ))}
          <FilaResumen label="Total entradas" valor={peso(totalEntradas)} bold color="var(--ok)" />
        </>
      )}

      {cierre.notas && (
        <div style={{ marginTop: 16, fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>
          {cierre.notas}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes auxiliares

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
      textTransform: "uppercase", color: "var(--text-3)", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function FilaResumen({
  label, valor, bold = false, color, mono = true,
}: {
  label: string;
  valor: string;
  bold?: boolean;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline",
      padding: "4px 0", fontSize: bold ? 15 : 13,
      fontWeight: bold ? 700 : 400,
    }}>
      <span style={{ color: color ?? "var(--text-2)" }}>{label}</span>
      <span style={{
        color: color ?? "var(--text)",
        fontVariantNumeric: mono ? "tabular-nums" : "normal",
      }}>
        {valor}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: ".06em",
        textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ErrorBanner({ mensaje }: { mensaje: string }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8, marginBottom: 16,
      background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
      border: "1px solid color-mix(in srgb, var(--danger) 30%, var(--border))",
      fontSize: 13, color: "var(--danger)",
    }}>
      {mensaje}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estilos

const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--bg)",
  padding: "0 12px", fontSize: 14, color: "var(--text)",
  fontFamily: "var(--font)", boxSizing: "border-box", outline: "none",
};

const btnPrimaryStyle: React.CSSProperties = {
  width: "100%", height: 44, borderRadius: 10, border: "none",
  background: "var(--accent)", color: "#fff",
  fontFamily: "var(--font)", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

const btnBorderStyle: React.CSSProperties = {
  height: 34, borderRadius: 8, border: "1px solid var(--border)",
  background: "transparent", color: "var(--text-2)",
  fontFamily: "var(--font)", fontSize: 13, fontWeight: 600,
  cursor: "pointer", padding: "0 14px",
};

const btnIconSmall: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 4, border: "none",
  background: "transparent", color: "var(--text-3)",
  cursor: "pointer", fontSize: 12, flexShrink: 0,
};
