import { useEffect, useState, useCallback } from "react";
import { EstadoPedido, OrigenPedido } from "@brasas/shared";
import { cargarPedidosActivos, actualizarEstado, type PedidoActivo } from "../services/pedidoEstado.js";
import { suscribirPedidos } from "../services/realtime.js";

interface Props {
  sucursalId: string;
  sucursalNombre: string;
  onVolver: () => void;
}

type FiltroTipo = "MOSTRADOR" | "RECOGER" | "DOMICILIO";

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

function horaCorta(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Mazatlan",
  });
}

interface Columna {
  estado: EstadoPedido;
  label: string;
  color: string;
  accion?: string;
  siguiente?: EstadoPedido;
  cancelable: boolean;
}

const COLUMNAS_POR_TIPO: Record<FiltroTipo, Columna[]> = {
  MOSTRADOR: [
    { estado: EstadoPedido.PENDIENTE, label: "Pendientes", color: "var(--warn)", accion: "Marcar entregado", siguiente: EstadoPedido.ENTREGADO, cancelable: true },
    { estado: EstadoPedido.ENTREGADO, label: "Entregados",  color: "var(--text-3)", cancelable: false },
  ],
  RECOGER: [
    { estado: EstadoPedido.PENDIENTE, label: "Pendientes", color: "var(--warn)", accion: "Marcar listo",      siguiente: EstadoPedido.LISTO,      cancelable: true },
    { estado: EstadoPedido.LISTO,     label: "Listos",     color: "var(--ok)",   accion: "Marcar entregado", siguiente: EstadoPedido.ENTREGADO,   cancelable: true },
    { estado: EstadoPedido.ENTREGADO, label: "Entregados", color: "var(--text-3)", cancelable: false },
  ],
  DOMICILIO: [
    { estado: EstadoPedido.PENDIENTE, label: "Pendientes", color: "var(--warn)", accion: "Marcar listo",   siguiente: EstadoPedido.LISTO,      cancelable: true },
    { estado: EstadoPedido.LISTO,     label: "Listos",     color: "var(--ok)",   accion: "Marcar enviado", siguiente: EstadoPedido.ENTREGADO,   cancelable: true },
    { estado: EstadoPedido.ENTREGADO, label: "Enviados",   color: "var(--text-3)", cancelable: false },
  ],
};

const ORIGEN_POR_TIPO: Record<FiltroTipo, OrigenPedido> = {
  MOSTRADOR: OrigenPedido.MOSTRADOR,
  RECOGER:   OrigenPedido.TELEFONO,
  DOMICILIO: OrigenPedido.DELIVERY,
};

const FILTROS: { valor: FiltroTipo; label: string }[] = [
  { valor: "MOSTRADOR", label: "Mostrador" },
  { valor: "RECOGER",   label: "Recoger"   },
  { valor: "DOMICILIO", label: "Domicilio" },
];

export function VistaPedidos({ sucursalId, sucursalNombre, onVolver }: Props) {
  const [pedidos, setPedidos]       = useState<PedidoActivo[]>([]);
  const [cargando, setCargando]     = useState(true);
  const [actualizando, setActualizando]             = useState<string | null>(null);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [filtro, setFiltro]         = useState<FiltroTipo>("MOSTRADOR");

  const cargar = useCallback(async () => {
    try {
      const data = await cargarPedidosActivos();
      setPedidos(data);
      setError(null);
    } catch {
      setError("No se pudo cargar los pedidos. ¿Hay conexión?");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const cancelar = suscribirPedidos(sucursalId, () => void cargar());
    return cancelar;
  }, [sucursalId, cargar]);

  async function avanzarEstado(pedido: PedidoActivo, siguiente: EstadoPedido) {
    setActualizando(pedido.id);
    try {
      await actualizarEstado(pedido.id, siguiente);
      setPedidos((prev) =>
        prev.map((p) => p.id === pedido.id ? { ...p, estado: siguiente } : p),
      );
    } catch {
      setError("No se pudo actualizar el estado. Verifica la conexión.");
    } finally {
      setActualizando(null);
    }
  }

  async function cancelar(pedido: PedidoActivo) {
    setConfirmandoCancelar(null);
    setActualizando(pedido.id);
    try {
      await actualizarEstado(pedido.id, EstadoPedido.CANCELADO);
      setPedidos((prev) => prev.filter((p) => p.id !== pedido.id));
    } catch {
      setError("No se pudo cancelar el pedido. Verifica la conexión.");
    } finally {
      setActualizando(null);
    }
  }

  const columnas = COLUMNAS_POR_TIPO[filtro];
  const pedidosFiltrados = pedidos.filter((p) => p.origen === ORIGEN_POR_TIPO[filtro]);
  const enProceso = pedidosFiltrados.filter((p) => p.estado !== EstadoPedido.ENTREGADO).length;

  return (
    <div style={{ position: "absolute", inset: 0, background: "var(--bg)", display: "flex", flexDirection: "column", zIndex: 20 }}>

      {/* ── Header ── */}
      <div style={{
        height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 12,
        padding: "0 20px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
      }}>
        <button onClick={onVolver} style={{
          background: "transparent", border: "1px solid var(--border)", borderRadius: 8,
          padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          color: "var(--text-2)", fontFamily: "var(--font)",
        }}>
          ← Venta
        </button>

        <span style={{ fontWeight: 600, fontSize: 15 }}>Pedidos</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{sucursalNombre}</span>

        {/* Filtros de tipo */}
        <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
          {FILTROS.map(({ valor, label }) => (
            <button key={valor} onClick={() => setFiltro(valor)} style={{
              padding: "5px 14px", borderRadius: 8, border: "1.5px solid",
              fontFamily: "var(--font)", fontSize: 13, fontWeight: 600, cursor: "pointer",
              borderColor: filtro === valor ? "var(--accent)" : "var(--border)",
              background: filtro === valor
                ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
                : "transparent",
              color: filtro === valor ? "var(--accent)" : "var(--text-2)",
            }}>
              {label}
            </button>
          ))}
        </div>

        {enProceso > 0 && (
          <div className="chip" style={{ marginLeft: 4 }}>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{enProceso}</span>
            <span> en proceso</span>
          </div>
        )}

        <button onClick={() => void cargar()} style={{
          marginLeft: "auto", background: "transparent", border: "1px solid var(--border)",
          borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 500,
          cursor: "pointer", color: "var(--text-3)", fontFamily: "var(--font)",
        }}>
          Actualizar
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          padding: "10px 20px",
          background: "color-mix(in srgb, var(--danger) 10%, var(--surface))",
          borderBottom: "1px solid color-mix(in srgb, var(--danger) 25%, var(--border))",
          fontSize: 13, color: "var(--danger)", display: "flex", justifyContent: "space-between",
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontFamily: "var(--font)" }}>✕</button>
        </div>
      )}

      {/* ── Columnas ── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: "grid",
        gridTemplateColumns: columnas.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
        gap: 1, background: "var(--border)", overflow: "hidden",
      }}>
        {columnas.map(({ estado, label, color, accion, siguiente, cancelable }) => {
          const grupo = pedidosFiltrados.filter((p) => p.estado === estado);
          return (
            <div key={estado} style={{ background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid var(--border)",
                background: "var(--surface)", display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-2)" }}>
                  {label}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: grupo.length > 0 ? color : "var(--text-3)" }}>
                  {grupo.length}
                </span>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {cargando ? (
                  <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13, padding: 24 }}>Cargando...</div>
                ) : grupo.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13, padding: 24 }}>Sin pedidos</div>
                ) : (
                  grupo.map((pedido) => (
                    <PedidoCard
                      key={pedido.id}
                      pedido={pedido}
                      cargando={actualizando === pedido.id}
                      confirmandoCancelar={confirmandoCancelar === pedido.id}
                      {...(accion !== undefined && { accion })}
                      {...(siguiente ? { onAvanzar: () => void avanzarEstado(pedido, siguiente) } : {})}
                      {...(cancelable ? {
                        onSolicitarCancelar:  () => setConfirmandoCancelar(pedido.id),
                        onConfirmarCancelar:  () => void cancelar(pedido),
                        onAbortarCancelar:    () => setConfirmandoCancelar(null),
                      } : {})}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PedidoCard
// ---------------------------------------------------------------------------
interface CardProps {
  pedido: PedidoActivo;
  accion?: string;
  cargando: boolean;
  confirmandoCancelar: boolean;
  onAvanzar?: () => void;
  onSolicitarCancelar?: () => void;
  onConfirmarCancelar?: () => void;
  onAbortarCancelar?: () => void;
}

function PedidoCard({
  pedido, accion, cargando, confirmandoCancelar,
  onAvanzar, onSolicitarCancelar, onConfirmarCancelar, onAbortarCancelar,
}: CardProps) {
  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid ${confirmandoCancelar ? "color-mix(in srgb, var(--danger) 40%, var(--border))" : "var(--border)"}`,
      borderRadius: 10, padding: "14px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Folio + hora creación */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
          #{String(pedido.folio).padStart(3, "0")}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{horaCorta(pedido.creadoEn)}</span>
      </div>

      {/* Nombre para recoger + hora estimada */}
      {(pedido.notas ?? pedido.horaRecoleccion) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 8px", borderRadius: 6,
          background: "color-mix(in srgb, var(--accent) 8%, var(--surface))",
          border: "1px solid color-mix(in srgb, var(--accent) 20%, var(--border))",
        }}>
          {pedido.notas && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
              {pedido.notas}
            </span>
          )}
          {pedido.horaRecoleccion && (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", marginLeft: "auto" }}>
              {horaCorta(pedido.horaRecoleccion)}
            </span>
          )}
        </div>
      )}

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {pedido.items.map((item) => (
          <div key={item.id} style={{ fontSize: 13, color: "var(--text-2)", display: "flex", gap: 6 }}>
            <span style={{ fontWeight: 600, color: "var(--text)", minWidth: 18 }}>{item.cantidad}×</span>
            <span>{item.productoNombre}</span>
          </div>
        ))}
        {pedido.items.some((i) => i.notas) && (
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, fontStyle: "italic" }}>
            {pedido.items.filter((i) => i.notas).map((i) => `"${i.notas!}"`).join(" · ")}
          </div>
        )}
      </div>

      {/* Total */}
      <div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>
        {fmt(pedido.total)}
      </div>

      {/* Cancelación */}
      {confirmandoCancelar ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--danger)", fontWeight: 600, textAlign: "center" }}>
            ¿Cancelar este pedido?
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onAbortarCancelar} style={{
              flex: 1, height: 34, borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface-2)", color: "var(--text-2)",
              fontFamily: "var(--font)", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>No</button>
            <button onClick={onConfirmarCancelar} disabled={cargando} style={{
              flex: 1, height: 34, borderRadius: 8, border: "none",
              background: "var(--danger)", color: "#fff",
              fontFamily: "var(--font)", fontSize: 12, fontWeight: 700,
              cursor: cargando ? "not-allowed" : "pointer", opacity: cargando ? 0.6 : 1,
            }}>{cargando ? "..." : "Sí, cancelar"}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          {accion && onAvanzar && (
            <button onClick={onAvanzar} disabled={cargando} style={{
              flex: 1, height: 38, borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface-2)", color: "var(--text)",
              fontFamily: "var(--font)", fontSize: 13, fontWeight: 600,
              cursor: cargando ? "not-allowed" : "pointer", opacity: cargando ? 0.5 : 1,
            }}>{cargando ? "..." : accion}</button>
          )}
          {onSolicitarCancelar && (
            <button onClick={onSolicitarCancelar} disabled={cargando} style={{
              width: accion ? 38 : "100%", height: 38, borderRadius: 8,
              border: "1px solid color-mix(in srgb, var(--danger) 30%, var(--border))",
              background: "transparent", color: "var(--danger)",
              fontFamily: "var(--font)", fontSize: accion ? 16 : 13, fontWeight: 600,
              cursor: cargando ? "not-allowed" : "pointer", opacity: cargando ? 0.4 : 1,
              flexShrink: 0,
            }}>{accion ? "✕" : "Cancelar"}</button>
          )}
        </div>
      )}
    </div>
  );
}
