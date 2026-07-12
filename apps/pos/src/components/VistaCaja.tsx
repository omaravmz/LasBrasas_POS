import { useEffect, useState } from "react";
import {
  getEstadoCaja, getVentasDia, abrirDia, cerrarDia,
  registrarMovimiento, eliminarMovimiento,
  type EstadoCaja, type CierreInfo, type VentasDia,
  type MovimientoCaja, type TipoMovimientoCaja, type PedidoDelDia,
} from "../services/cajaService.js";
import { actualizarEstado } from "../services/pedidoEstado.js";
import { EstadoPedido } from "@brasas/shared";
import { dispararImpresionCierre, type DatosCierreImpresion } from "../services/print.js";
import { mensajeError } from "../lib/api.js";

interface Props {
  sucursalNombre: string;
  onCerrar: () => void;
}

type Seccion = "menu" | "ventas" | "movimientos" | "cierre";

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

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    timeZone: "America/Mazatlan", hour: "2-digit", minute: "2-digit",
  });
}

const ETIQUETA_METODO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TRANSFERENCIA: "Transferencia",
};

// Un pedido solo se puede cancelar mientras no esté entregado ni cancelado.
function sePuedeCancelar(p: PedidoDelDia): boolean {
  return p.estado === "PENDIENTE" || p.estado === "LISTO";
}

function generarReporte(estado: EstadoCaja, cierre: CierreInfo, sucursalNombre: string): string {
  const difSign = cierre.diferencia >= 0 ? "SOBRA" : "FALTA";
  const enTerminal = cierre.ventasTarjeta + cierre.ventasTransfer;

  const lines = [
    `LAS BRASAS — ${sucursalNombre}`,
    `Corte del ${estado.fecha}  |  ${fechaLegible(cierre.cerradoEn)}`,
    "",
    "═══ VENTAS DEL DÍA ═══════════════",
    `Efectivo:       ${peso(cierre.ventasEfectivo)}`,
    `Tarjeta:        ${peso(cierre.ventasTarjeta)}`,
    `Transferencia:  ${peso(cierre.ventasTransfer)}`,
    `TOTAL VENTAS:   ${peso(cierre.totalVentas)}`,
    "",
    "═══ CAJA ══════════════════════════",
    `Fondo inicial:  ${peso(cierre.fondoInicial)}`,
    ...(cierre.totalEntradas > 0 ? [`+ Entradas:     ${peso(cierre.totalEntradas)}`] : []),
    ...(cierre.totalGastos > 0 ? [`- Gastos:       ${peso(cierre.totalGastos)}`] : []),
    `Esperado caja:  ${peso(cierre.esperadoEnCaja)}`,
    `En terminal:    ${peso(enTerminal)}`,
    `Conteo físico:  ${peso(cierre.conteoFisico)}`,
    `Diferencia:     ${cierre.diferencia >= 0 ? "+" : ""}${peso(cierre.diferencia)} (${difSign})`,
    ...(cierre.gastos.length > 0
      ? ["", "═══ GASTOS ═════════════════════════",
          ...cierre.gastos.map((g) => `• ${g.concepto}: ${peso(g.monto)}`)]
      : []),
    ...(cierre.entradas.length > 0
      ? ["", "═══ ENTRADAS ═══════════════════════",
          ...cierre.entradas.map((e) => `• ${e.concepto}: ${peso(e.monto)}`)]
      : []),
    ...(cierre.notas ? ["", "═══ NOTAS ══════════════════════════", cierre.notas] : []),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Componente principal

export function VistaCaja({ sucursalNombre, onCerrar }: Props) {
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("menu");
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
    } catch (err) {
      setError(mensajeError(err, "No se pudo cargar el estado de caja."));
    } finally {
      setCargando(false);
    }
  }

  const titulo =
    seccion === "ventas" ? "Ventas del día"
      : seccion === "movimientos" ? "Entradas y retiros"
        : seccion === "cierre" ? "Cierre de día"
          : "Caja";

  function volver() {
    if (seccion === "menu") onCerrar();
    else {
      setSeccion("menu");
      void cargar();
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
        <button onClick={volver} style={btnBorderStyle}>← Volver</button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{titulo}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{sucursalNombre}</span>
        {estado && (
          <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>
            {estado.fecha}
          </span>
        )}
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24 }}>
        {error && <ErrorBanner mensaje={error} />}
        {cargando && <div style={{ color: "var(--text-3)", fontSize: 14 }}>Cargando...</div>}

        {!cargando && estado && (
          <>
            {/* Día sin abrir */}
            {!estado.apertura && <PantallaApertura onAbierto={cargar} />}

            {/* Día ya cerrado */}
            {estado.cierre && (
              <PantallaResumen
                estado={estado}
                cierre={estado.cierre}
                sucursalNombre={sucursalNombre}
              />
            )}

            {/* Día abierto y operando */}
            {estado.apertura && !estado.cierre && (
              <>
                {seccion === "menu" && (
                  <MenuCaja estado={estado} onIr={setSeccion} />
                )}
                {seccion === "ventas" && (
                  <SeccionVentas onCambio={cargar} />
                )}
                {seccion === "movimientos" && (
                  <SeccionMovimientos estado={estado} onCambio={cargar} />
                )}
                {seccion === "cierre" && (
                  <SeccionCierre
                    estado={estado}
                    sucursalNombre={sucursalNombre}
                    onCerrado={() => { setSeccion("menu"); void cargar(); }}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menú principal

function MenuCaja({ estado, onIr }: { estado: EstadoCaja; onIr: (s: Seccion) => void }) {
  const ventas = estado.ventasDelDia;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Resumen compacto del estado actual */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24,
      }}>
        <Indicador
          label="Esperado en caja"
          valor={peso(estado.esperadoEnCaja ?? 0)}
          destacado
        />
        <Indicador label="Ventas del día" valor={peso(ventas?.totalVentas ?? 0)} />
        <Indicador label="Pedidos" valor={String(ventas?.numPedidos ?? 0)} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <BotonAccion
          titulo="Ventas del día"
          detalle="Revisar pedidos y cancelar tickets"
          onClick={() => onIr("ventas")}
        />
        <BotonAccion
          titulo="Entrada / Retiro"
          detalle={
            estado.movimientos.length > 0
              ? `${estado.movimientos.length} movimiento(s) hoy`
              : "Registrar dinero que entra o sale"
          }
          onClick={() => onIr("movimientos")}
        />
        <BotonAccion
          titulo="Cierre de día"
          detalle="Totalizar, conciliar e imprimir el corte"
          onClick={() => onIr("cierre")}
          peligro
        />
      </div>
    </div>
  );
}

function BotonAccion({
  titulo, detalle, onClick, peligro = false,
}: {
  titulo: string;
  detalle: string;
  onClick: () => void;
  peligro?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "18px 20px", borderRadius: 12, cursor: "pointer",
        background: "var(--surface)", textAlign: "left",
        border: `1px solid ${peligro ? "var(--danger)" : "var(--border)"}`,
        fontFamily: "var(--font)", width: "100%",
      }}
    >
      <span style={{ flex: 1 }}>
        <span style={{
          display: "block", fontSize: 16, fontWeight: 700,
          color: peligro ? "var(--danger)" : "var(--text)",
        }}>
          {titulo}
        </span>
        <span style={{ display: "block", fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
          {detalle}
        </span>
      </span>
      <span style={{ fontSize: 18, color: "var(--text-3)" }}>›</span>
    </button>
  );
}

function Indicador({
  label, valor, destacado = false,
}: {
  label: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div style={{
      padding: "14px 16px", borderRadius: 10,
      background: "var(--surface)",
      border: `1px solid ${destacado ? "var(--accent)" : "var(--border)"}`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: ".06em",
        textTransform: "uppercase", color: "var(--text-3)", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: destacado ? "var(--accent)" : "var(--text)",
      }}>
        {valor}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sección: Ventas del día

function SeccionVentas({ onCambio }: { onCambio: () => void }) {
  const [datos, setDatos] = useState<VentasDia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<PedidoDelDia | null>(null);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    void cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      setDatos(await getVentasDia());
      setError(null);
    } catch (err) {
      setError(mensajeError(err, "No se pudieron cargar las ventas del día."));
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(pedido: PedidoDelDia) {
    setCancelando(true);
    setError(null);
    try {
      await actualizarEstado(pedido.id, EstadoPedido.CANCELADO);
      setConfirmando(null);
      await cargar();
      onCambio();
    } catch (err) {
      setError(
        mensajeError(err, `No se pudo cancelar el folio #${String(pedido.folio).padStart(3, "0")}.`),
      );
    } finally {
      setCancelando(false);
    }
  }

  if (cargando) return <div style={{ color: "var(--text-3)", fontSize: 14 }}>Cargando...</div>;
  if (!datos) return <ErrorBanner mensaje={error ?? "Sin datos"} />;

  const { resumen, pedidos } = datos;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {error && <ErrorBanner mensaje={error} />}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24,
      }}>
        <Indicador label="Pedidos" valor={String(resumen.numPedidos)} />
        <Indicador label="Efectivo" valor={peso(resumen.ventasEfectivo)} />
        <Indicador label="Tarjeta" valor={peso(resumen.ventasTarjeta)} />
        <Indicador label="Transferencia" valor={peso(resumen.ventasTransfer)} />
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 12,
      }}>
        <SectionTitle>Pedidos del día</SectionTitle>
        <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          Total: {peso(resumen.totalVentas)}
        </span>
      </div>

      {pedidos.length === 0 && (
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>Aún no hay pedidos hoy.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pedidos.map((p) => {
          const cancelado = p.estado === "CANCELADO";
          return (
            <div
              key={p.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 8,
                background: "var(--surface)", border: "1px solid var(--border)",
                opacity: cancelado ? 0.55 : 1,
              }}
            >
              <span style={{
                fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 52,
              }}>
                #{String(p.folio).padStart(3, "0")}
              </span>

              <span style={{ fontSize: 13, color: "var(--text-3)", minWidth: 100 }}>
                {p.metodoPago ? ETIQUETA_METODO[p.metodoPago] : "Sin cobrar"}
              </span>

              <span style={{ fontSize: 12, color: "var(--text-3)" }}>{hora(p.creadoEn)}</span>

              <span style={{ flex: 1 }} />

              {cancelado ? (
                <>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: "var(--danger)",
                    textTransform: "uppercase", letterSpacing: ".04em",
                  }}>
                    Cancelado
                  </span>
                  <span style={{
                    fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 90,
                    textAlign: "right",
                  }}>
                    {peso(0)}
                  </span>
                </>
              ) : (
                <>
                  <span style={{
                    fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 90,
                    textAlign: "right",
                  }}>
                    {peso(p.total)}
                  </span>
                  <button
                    onClick={() => setConfirmando(p)}
                    disabled={!sePuedeCancelar(p)}
                    title={
                      sePuedeCancelar(p)
                        ? "Cancelar este ticket"
                        : "Un pedido entregado ya no se puede cancelar"
                    }
                    style={{
                      ...btnBorderStyle,
                      height: 30, padding: "0 10px", fontSize: 12,
                      color: sePuedeCancelar(p) ? "var(--danger)" : "var(--text-3)",
                      borderColor: sePuedeCancelar(p) ? "var(--danger)" : "var(--border)",
                      cursor: sePuedeCancelar(p) ? "pointer" : "not-allowed",
                      opacity: sePuedeCancelar(p) ? 1 : 0.5,
                    }}
                  >
                    Cancelar
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {confirmando && (
        <Confirmacion
          titulo={`¿Cancelar el folio #${String(confirmando.folio).padStart(3, "0")}?`}
          mensaje={`La venta de ${peso(confirmando.total)} pasará a $0.00 y dejará de contar en el corte.`}
          textoConfirmar={cancelando ? "Cancelando..." : "Sí, cancelar ticket"}
          deshabilitado={cancelando}
          onConfirmar={() => void cancelar(confirmando)}
          onCancelar={() => setConfirmando(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sección: Entradas y retiros

function SeccionMovimientos({
  estado, onCambio,
}: {
  estado: EstadoCaja;
  onCambio: () => void;
}) {
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>(estado.movimientos);
  const [tipo, setTipo] = useState<TipoMovimientoCaja>("GASTO");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totales = movimientos.reduce(
    (acc, m) => {
      if (m.tipo === "ENTRADA") acc.entradas += m.monto;
      else acc.gastos += m.monto;
      return acc;
    },
    { entradas: 0, gastos: 0 },
  );

  async function agregar() {
    const m = parseFloat(monto);
    if (!concepto.trim()) { setError("Escribe un concepto"); return; }
    if (isNaN(m) || m <= 0) { setError("El monto debe ser mayor a 0"); return; }

    setError(null);
    setEnviando(true);
    try {
      const nuevo = await registrarMovimiento(crypto.randomUUID(), tipo, concepto.trim(), m);
      setMovimientos((prev) => [...prev, nuevo]);
      setConcepto("");
      setMonto("");
      onCambio();
    } catch (err) {
      setError(mensajeError(err, "No se pudo registrar el movimiento."));
    } finally {
      setEnviando(false);
    }
  }

  async function quitar(id: string) {
    setError(null);
    try {
      await eliminarMovimiento(id);
      setMovimientos((prev) => prev.filter((m) => m.id !== id));
      onCambio();
    } catch (err) {
      setError(mensajeError(err, "No se pudo eliminar el movimiento."));
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      {error && <ErrorBanner mensaje={error} />}

      {/* Selector de tipo */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["GASTO", "ENTRADA"] as const).map((t) => {
          const activo = tipo === t;
          const color = t === "GASTO" ? "var(--danger)" : "var(--ok)";
          return (
            <button
              key={t}
              onClick={() => setTipo(t)}
              style={{
                flex: 1, height: 44, borderRadius: 10, cursor: "pointer",
                fontFamily: "var(--font)", fontSize: 14, fontWeight: 700,
                border: `1px solid ${activo ? color : "var(--border)"}`,
                background: activo ? `color-mix(in srgb, ${color} 12%, var(--surface))` : "transparent",
                color: activo ? color : "var(--text-2)",
              }}
            >
              {t === "GASTO" ? "Retiro / Gasto" : "Entrada"}
            </button>
          );
        })}
      </div>

      <Field label="Concepto">
        <input
          type="text" value={concepto} autoFocus
          onChange={(e) => setConcepto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void agregar()}
          placeholder={tipo === "GASTO" ? "Ej. Gas, servilletas" : "Ej. Fondo extra"}
          style={inputStyle}
        />
      </Field>

      <Field label="Monto ($)">
        <input
          type="number" min="0" step="0.01" value={monto}
          onChange={(e) => setMonto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void agregar()}
          placeholder="0.00"
          style={inputStyle}
        />
      </Field>

      <button
        onClick={() => void agregar()}
        disabled={enviando}
        style={{
          ...btnPrimaryStyle,
          marginTop: 4, marginBottom: 24,
          background: tipo === "GASTO" ? "var(--danger)" : "var(--ok)",
        }}
      >
        {enviando ? "Registrando..." : tipo === "GASTO" ? "Registrar retiro" : "Registrar entrada"}
      </button>

      <SectionTitle>Movimientos de hoy</SectionTitle>

      {movimientos.length === 0 && (
        <div style={{ color: "var(--text-3)", fontSize: 13 }}>Sin movimientos registrados.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {movimientos.map((m) => {
          const esGasto = m.tipo === "GASTO";
          return (
            <div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 8,
              background: "var(--surface)", border: "1px solid var(--border)",
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: ".04em", minWidth: 62,
                color: esGasto ? "var(--danger)" : "var(--ok)",
              }}>
                {esGasto ? "Retiro" : "Entrada"}
              </span>
              <span style={{ flex: 1, fontSize: 13 }}>{m.concepto}</span>
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>{hora(m.creadoEn)}</span>
              <span style={{
                fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 90,
                textAlign: "right", color: esGasto ? "var(--danger)" : "var(--ok)",
              }}>
                {esGasto ? "-" : "+"}{peso(m.monto)}
              </span>
              <button onClick={() => void quitar(m.id)} style={btnIconSmall} title="Eliminar">✕</button>
            </div>
          );
        })}
      </div>

      {movimientos.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <FilaResumen label="Total entradas" valor={`+${peso(totales.entradas)}`} color="var(--ok)" />
          <FilaResumen label="Total retiros" valor={`-${peso(totales.gastos)}`} color="var(--danger)" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sección: Cierre de día

function SeccionCierre({
  estado, sucursalNombre, onCerrado,
}: {
  estado: EstadoCaja;
  sucursalNombre: string;
  onCerrado: () => void;
}) {
  const [conteo, setConteo] = useState("");
  const [notas, setNotas] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ventas = estado.ventasDelDia;
  const apertura = estado.apertura;
  if (!ventas || !apertura) return null;

  const { entradas, gastos } = estado.totalesMovimientos;
  const esperado = estado.esperadoEnCaja ?? 0;
  const enTerminal = ventas.ventasTarjeta + ventas.ventasTransfer;

  const conteoNum = parseFloat(conteo);
  const diferencia = isNaN(conteoNum) ? null : conteoNum - esperado;

  async function cerrar() {
    if (isNaN(conteoNum) || conteoNum < 0) {
      setError("Ingresa el conteo físico de caja");
      setConfirmando(false);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const cierre = await cerrarDia(
        crypto.randomUUID(),
        conteoNum,
        notas.trim() || undefined,
      );

      // El corte se imprime con la lista de pedidos del día tal como quedó al cerrar.
      const ventasDia = await getVentasDia();
      const datos: DatosCierreImpresion = {
        sucursal: sucursalNombre,
        fecha: estado.fecha,
        cerradoEn: cierre.cerradoEn,
        fondoInicial: cierre.fondoInicial,
        ventasEfectivo: cierre.ventasEfectivo,
        ventasTarjeta: cierre.ventasTarjeta,
        ventasTransfer: cierre.ventasTransfer,
        totalVentas: cierre.totalVentas,
        numPedidos: ventasDia.resumen.numPedidos,
        pedidos: ventasDia.pedidos.map((p) => ({
          folio: p.folio,
          total: p.total,
          metodoPago: p.metodoPago,
          cancelado: p.estado === "CANCELADO",
        })),
        entradas: cierre.entradas.map((e) => ({ concepto: e.concepto, monto: e.monto })),
        gastos: cierre.gastos.map((g) => ({ concepto: g.concepto, monto: g.monto })),
        reembolsosEfectivo: cierre.reembolsosEfectivo,
        esperadoEnCaja: cierre.esperadoEnCaja,
        conteoFisico: cierre.conteoFisico,
        diferencia: cierre.diferencia,
        ...(cierre.notas !== null && { notas: cierre.notas }),
      };
      await dispararImpresionCierre(datos);

      onCerrado();
    } catch (err) {
      setError(mensajeError(err, "No se pudo registrar el cierre."));
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32,
      maxWidth: 900, margin: "0 auto",
    }}>
      {/* Izquierda: totales calculados */}
      <div>
        <SectionTitle>Ventas del día</SectionTitle>
        <FilaResumen label="Pedidos" valor={String(ventas.numPedidos)} mono={false} />
        <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
        <FilaResumen label="Efectivo" valor={peso(ventas.ventasEfectivo)} />
        <FilaResumen label="Tarjeta" valor={peso(ventas.ventasTarjeta)} />
        <FilaResumen label="Transferencia" valor={peso(ventas.ventasTransfer)} />
        <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
        <FilaResumen label="Total ventas" valor={peso(ventas.totalVentas)} bold />

        <div style={{ height: 24 }} />
        <SectionTitle>Dinero esperado</SectionTitle>
        <FilaResumen label="Fondo inicial" valor={peso(apertura.fondoInicial)} />
        <FilaResumen label="+ Ventas efectivo" valor={peso(ventas.ventasEfectivo)} />
        {entradas > 0 && (
          <FilaResumen label="+ Entradas" valor={`+${peso(entradas)}`} color="var(--ok)" />
        )}
        {gastos > 0 && (
          <FilaResumen label="− Gastos / retiros" valor={`-${peso(gastos)}`} color="var(--danger)" />
        )}
        <div style={{ height: 1, background: "var(--border)", margin: "10px 0" }} />
        <FilaResumen label="Esperado en caja" valor={peso(esperado)} bold />
        <FilaResumen label="Esperado en terminal" valor={peso(enTerminal)} bold />
      </div>

      {/* Derecha: conteo y confirmación */}
      <div>
        {error && <ErrorBanner mensaje={error} />}

        <SectionTitle>Conteo físico de caja</SectionTitle>
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

        <Field label="Notas (opcional)">
          <textarea
            value={notas} onChange={(e) => setNotas(e.target.value)}
            rows={2} placeholder="Observaciones del cierre..."
            style={{ ...inputStyle, height: "auto", resize: "none", padding: "8px 12px" }}
          />
        </Field>

        <button
          onClick={() => setConfirmando(true)}
          disabled={enviando || isNaN(conteoNum)}
          style={{
            ...btnPrimaryStyle, marginTop: 16, background: "var(--danger)",
            opacity: isNaN(conteoNum) ? 0.5 : 1,
            cursor: isNaN(conteoNum) ? "not-allowed" : "pointer",
          }}
        >
          {enviando ? "Cerrando..." : "Cerrar día e imprimir corte"}
        </button>
      </div>

      {confirmando && (
        <Confirmacion
          titulo="¿Cerrar el día?"
          mensaje="Se totalizan las ventas, se cierra la caja y se imprime el corte. Esta acción no se puede deshacer."
          textoConfirmar={enviando ? "Cerrando..." : "Sí, cerrar día"}
          deshabilitado={enviando}
          onConfirmar={() => void cerrar()}
          onCancelar={() => setConfirmando(false)}
        />
      )}
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
    } catch (err) {
      setError(mensajeError(err, "No se pudo registrar la apertura."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700 }}>Apertura del día</h2>

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
// Pantalla: Resumen post-cierre

function PantallaResumen({
  estado, cierre, sucursalNombre,
}: {
  estado: EstadoCaja;
  cierre: CierreInfo;
  sucursalNombre: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const enTerminal = cierre.ventasTarjeta + cierre.ventasTransfer;

  function copiar() {
    void navigator.clipboard.writeText(generarReporte(estado, cierre, sucursalNombre)).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
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

      <div style={{ height: 20 }} />
      <SectionTitle>Conciliación</SectionTitle>
      <FilaResumen label="Fondo inicial" valor={peso(cierre.fondoInicial)} />
      {cierre.totalEntradas > 0 && (
        <FilaResumen label="+ Entradas" valor={`+${peso(cierre.totalEntradas)}`} color="var(--ok)" />
      )}
      {cierre.totalGastos > 0 && (
        <FilaResumen label="− Gastos / retiros" valor={`-${peso(cierre.totalGastos)}`} color="var(--danger)" />
      )}
      <FilaResumen label="Esperado en caja" valor={peso(cierre.esperadoEnCaja)} bold />
      <FilaResumen label="Esperado en terminal" valor={peso(enTerminal)} />
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
          <SectionTitle>Gastos / retiros</SectionTitle>
          {cierre.gastos.map((g) => (
            <FilaResumen key={g.id} label={g.concepto} valor={peso(g.monto)} color="var(--danger)" />
          ))}
        </>
      )}

      {cierre.entradas.length > 0 && (
        <>
          <div style={{ height: 20 }} />
          <SectionTitle>Entradas</SectionTitle>
          {cierre.entradas.map((e) => (
            <FilaResumen key={e.id} label={e.concepto} valor={peso(e.monto)} color="var(--ok)" />
          ))}
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

function Confirmacion({
  titulo, mensaje, textoConfirmar, deshabilitado, onConfirmar, onCancelar,
}: {
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  deshabilitado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 40,
      background: "rgba(0,0,0,.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 420, borderRadius: 14, padding: 24,
        background: "var(--surface)", border: "1px solid var(--border)",
      }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 17, fontWeight: 700 }}>{titulo}</h3>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
          {mensaje}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancelar}
            disabled={deshabilitado}
            style={{ ...btnBorderStyle, flex: 1, height: 42 }}
          >
            Volver
          </button>
          <button
            onClick={onConfirmar}
            disabled={deshabilitado}
            style={{ ...btnPrimaryStyle, flex: 1, background: "var(--danger)" }}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

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
