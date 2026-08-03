import { useEffect, useState } from "react";
import {
  getEstadoCaja, getVentasDia, abrirDia, cerrarDia, getDiasSinCerrar,
  registrarMovimiento, eliminarMovimiento,
  TipoMovimientoCaja,
  type EstadoCaja, type VentasDia,
} from "../services/cajaService.js";
import { armarCorte, imprimirCorte } from "../services/corte.js";
import { diaOperativo, fechaOperativaCorta } from "../services/diaOperativo.js";
import { actualizarEstado, cargarPedidosActivos, type PedidoActivo } from "../services/pedidoEstado.js";
import { EstadoPedido } from "@brasas/shared";
import { dispararImpresionCierre } from "../services/print.js";
import { mensajeError } from "../lib/api.js";
import { sincronizarTodo } from "../sync/colaSync.js";
import {
  IcoPower, IcoSwap, IcoReceipt, IcoClose, IcoLock, IcoPrint,
  IcoChevron, IcoChevronLeft, IcoBanknote, IcoCard, IcoCheck, IcoTrash,
} from "./Iconos.js";
import type { AperturaLocal } from "../db/types.js";

interface Props {
  sucursalNombre: string;
}

type Sub = "hub" | "inicio" | "movimientos" | "ventas" | "cancelaciones" | "corte" | "cierre";

// Motivos de cancelación definidos por el negocio. Nota: el backend NO persiste el motivo
// todavía (no hay campo en el schema); se captura como paso deliberado del cajero.
const MOTIVOS = ["Cliente canceló", "Error de captura"];

// ---------------------------------------------------------------------------
// Helpers de formato
function peso(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pesoCorto(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}
function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    timeZone: "America/Mazatlan", hour: "2-digit", minute: "2-digit",
  });
}
function fechaLegible(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    timeZone: "America/Mazatlan", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const ETIQUETA_METODO: Record<string, string> = {
  EFECTIVO: "Efectivo", TARJETA: "Tarjeta", TRANSFERENCIA: "Transferencia",
};

// Banda de estado para turnos que quedaron sin cerrar (RN-24). Etiqueta, fechas y acción
// en una sola fila.
function AlertaTurnoSinCerrar({
  pendientes, onCerrar,
}: { pendientes: AperturaLocal[]; onCerrar: (fecha: string) => void }) {
  const varios = pendientes.length > 1;

  return (
    <div className="turno-alerta">
      <div className="turno-alerta-txt">
        <div className="turno-alerta-lbl">{varios ? "Turnos sin cerrar" : "Turno sin cerrar"}</div>
        <div className="turno-alerta-dato">
          {pendientes.map((a) => fechaOperativaCorta(a.fechaOperativa)).join(" · ")}
        </div>
      </div>
      <div className="turno-alerta-acc">
        {pendientes.map((a) => (
          <button className="btn" key={a.id} onClick={() => onCerrar(a.fechaOperativa)}>
            <IcoLock size={16} />
            {varios ? `Cerrar ${fechaOperativaCorta(a.fechaOperativa)}` : "Cerrar turno"}
          </button>
        ))}
      </div>
    </div>
  );
}

// Aviso de "turno cerrado" para las secciones que exigen caja abierta. Centrado y con
// realce para que no se lea como una nota inline perdida en el panel.
function AvisoTurno({ children }: { children: React.ReactNode }) {
  return (
    <div className="sub-scroll">
      <div className="aviso-turno">
        <div className="aviso-ico"><IcoPower size={22} /></div>
        <p>{children}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal — hub + sub-pantallas
// ---------------------------------------------------------------------------
export function VistaCaja({ sucursalNombre }: Props) {
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  // Turnos de días anteriores que quedaron sin cerrar (RN-24). Mientras haya uno, la
  // apertura de hoy está bloqueada, así que el hub lo muestra arriba de todo.
  const [pendientes, setPendientes] = useState<AperturaLocal[]>([]);
  const [sub, setSub] = useState<Sub>("hub");
  // Fecha sobre la que operan Corte y Cierre. Normalmente hoy, pero pasa a ser la de un
  // día pendiente cuando el encargado entra a cerrarlo desde el aviso.
  const [fechaFoco, setFechaFoco] = useState<string>(diaOperativo());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void cargar(); }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const [e, p] = await Promise.all([getEstadoCaja(), getDiasSinCerrar()]);
      setEstado(e);
      setPendientes(p);
    } catch (err) {
      setError(mensajeError(err, "No se pudo cargar el estado de caja."));
    } finally {
      setCargando(false);
    }
  }

  function volverAlHub() {
    setSub("hub");
    setFechaFoco(diaOperativo());
    void cargar();
  }

  if (cargando || !estado) {
    return (
      <div className="screen">
        <div className="screen-head"><div><h1 className="screen-title">Caja</h1></div></div>
        <div className="sub-scroll">
          {error ? <div className="note-box warn">{error}</div> : <div className="muted small">Cargando…</div>}
        </div>
      </div>
    );
  }

  const abierto = !!estado.apertura && !estado.cierre;
  const ventas = estado.ventasDelDia;

  const ACCIONES: { id: Sub; icon: JSX.Element; titulo: string; desc: string; meta: string }[] = [
    {
      id: "inicio", icon: <IcoPower size={22} />, titulo: "Inicio de turno",
      desc: "Abrir caja y registrar el fondo inicial",
      meta: abierto ? `Abierto ${hora(estado.apertura!.abiertoEn)}` : estado.cierre ? "Día cerrado" : "Sin abrir",
    },
    {
      id: "movimientos", icon: <IcoSwap size={22} />, titulo: "Entradas y salidas",
      desc: "Retiros, depósitos y cambio adicional",
      meta: `${estado.movimientos.length} registrado${estado.movimientos.length === 1 ? "" : "s"}`,
    },
    {
      id: "ventas", icon: <IcoReceipt size={22} />, titulo: "Ventas del turno",
      desc: "Resumen por método y lista de ventas",
      meta: ventas ? `${pesoCorto(ventas.totalVentas)} · ${ventas.numPedidos}` : "—",
    },
    {
      id: "cancelaciones", icon: <IcoClose size={22} />, titulo: "Cancelaciones",
      desc: "Cancelar pedidos abiertos por folio",
      meta: abierto ? "Por folio" : "Turno cerrado",
    },
    {
      id: "corte", icon: <IcoPrint size={22} />, titulo: "Generar corte",
      desc: "Conteo de control",
      meta: estado.esperadoEnCaja != null ? `Esperado ${pesoCorto(estado.esperadoEnCaja)}` : "—",
    },
    {
      id: "cierre", icon: <IcoLock size={22} />, titulo: "Cierre de turno",
      desc: "Corte final de la jornada",
      meta: estado.cierre ? "Cerrado" : abierto ? "Turno abierto" : "—",
    },
  ];

  if (sub !== "hub") {
    const acc = ACCIONES.find((a) => a.id === sub)!;
    const esOtroDia = fechaFoco !== diaOperativo();
    return (
      <div className="screen">
        <div className="sub-bar">
          <button className="back-btn" onClick={volverAlHub}>
            <IcoChevronLeft size={18} /> Caja
          </button>
          <div className="pkg-title-wrap">
            <h1 className="pkg-title">
              {acc.titulo}{esOtroDia ? ` · ${fechaOperativaCorta(fechaFoco)}` : ""}
            </h1>
          </div>
        </div>
        {sub === "inicio" && (
          <SubInicio estado={estado} pendientes={pendientes} onCambio={cargar}
            onIrACierre={(fecha) => { setFechaFoco(fecha); setSub("cierre"); }} />
        )}
        {sub === "movimientos" && <SubMovimientos estado={estado} onCambio={cargar} />}
        {sub === "ventas" && <SubVentas estado={estado} />}
        {sub === "cancelaciones" && <SubCancelaciones estado={estado} onCambio={cargar} />}
        {sub === "corte" && <SubCorte fecha={fechaFoco} sucursalNombre={sucursalNombre} />}
        {sub === "cierre" && (
          <SubCierre fecha={fechaFoco} sucursalNombre={sucursalNombre} onCerrado={volverAlHub} />
        )}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Caja</h1>
        </div>
        <div className="screen-head-actions">
          {abierto
            ? <div className="chip ok"><span className="dot" /> Turno activo</div>
            : <div className="chip warn"><span className="dot" /> Caja cerrada</div>}
        </div>
      </div>

      <div className="caja-hub">
        {pendientes.length > 0 && (
          <AlertaTurnoSinCerrar
            pendientes={pendientes}
            onCerrar={(fecha) => { setFechaFoco(fecha); setSub("cierre"); }}
          />
        )}

        <div className="hub-grid">
          {ACCIONES.map((a) => (
            <button className="hub-card" key={a.id} onClick={() => setSub(a.id)}>
              <div className="hub-ico">{a.icon}</div>
              <div className="hub-body">
                <div className="hub-title">{a.titulo}</div>
                <div className="hub-desc">{a.desc}</div>
              </div>
              <div className="hub-foot">
                <span className="hub-meta">{a.meta}</span>
                <IcoChevron size={17} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Inicio de turno (apertura)
// ---------------------------------------------------------------------------
function SubInicio({
  estado, pendientes, onCambio, onIrACierre,
}: {
  estado: EstadoCaja;
  pendientes: AperturaLocal[];
  onCambio: () => void;
  onIrACierre: (fecha: string) => void;
}) {
  const [fondo, setFondo] = useState("");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    const n = parseFloat(fondo);
    if (isNaN(n) || n < 0) { setError("Ingresa un fondo inicial válido (puede ser 0)."); return; }
    setError(null); setEnviando(true);
    try {
      await abrirDia(crypto.randomUUID(), n, notas.trim() || undefined);
      // La apertura debe llegar al servidor ANTES que las ventas (BD): la cola la envía primero.
      void sincronizarTodo();
      onCambio();
    } catch (err) {
      setError(mensajeError(err, "No se pudo registrar la apertura."));
    } finally {
      setEnviando(false);
    }
  }

  if (estado.cierre) {
    return (
      <div className="sub-scroll center">
        <div className="panel">
          <div className="panel-head">Turno cerrado</div>
          <div className="note-box"><IcoCheck size={15} /> El corte del día ya se realizó. Para abrir un turno nuevo, espera la siguiente jornada.</div>
        </div>
      </div>
    );
  }

  // RN-24: con un turno anterior sin cerrar no se abre uno nuevo. El servicio lo rechaza
  // de todos modos; aquí se evita que el encargado capture el fondo para nada.
  if (pendientes.length > 0) {
    return (
      <div className="sub-scroll center">
        <AlertaTurnoSinCerrar pendientes={pendientes} onCerrar={onIrACierre} />
      </div>
    );
  }

  if (estado.apertura) {
    return (
      <div className="sub-scroll center">
        <div className="panel">
          <div className="panel-head">Turno en curso</div>
          <div className="arq-row"><span>Hora de apertura</span><span>{hora(estado.apertura.abiertoEn)}</span></div>
          <div className="arq-row"><span>Fondo inicial</span><span>{peso(estado.apertura.fondoInicial)}</span></div>
          {estado.apertura.notas && <div className="arq-row"><span>Notas</span><span>{estado.apertura.notas}</span></div>}
          <div className="note-box" style={{ marginTop: 14 }}>
            Para cerrar el día ve a <strong>Cierre de turno</strong>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sub-scroll center">
      <div className="panel">
        <div className="panel-head">Abrir caja</div>
        {error && <div className="note-box warn" style={{ marginBottom: 12 }}>{error}</div>}
        <label className="fld">
          <span className="fld-lbl">Fondo inicial en caja</span>
          <div className="fld-box">
            <IcoBanknote size={17} />
            <input inputMode="decimal" value={fondo} placeholder="0.00" autoFocus
              onChange={(e) => setFondo(e.target.value.replace(/[^0-9.]/g, ""))} />
          </div>
        </label>
        <label className="fld">
          <span className="fld-lbl">Notas (opcional)</span>
          <div className="fld-box">
            <input value={notas} placeholder="Ej. fondo reducido por día festivo"
              onChange={(e) => setNotas(e.target.value)} />
          </div>
        </label>
        <button className="btn primary block" disabled={enviando || !fondo} onClick={() => void abrir()}>
          <IcoPower size={17} /> {enviando ? "Abriendo…" : "Abrir turno"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Entradas y salidas (movimientos)
// ---------------------------------------------------------------------------
function SubMovimientos({ estado, onCambio }: { estado: EstadoCaja; onCambio: () => void }) {
  const [movimientos, setMovimientos] = useState(estado.movimientos);
  const [tipo, setTipo] = useState<TipoMovimientoCaja>(TipoMovimientoCaja.GASTO);
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const bloqueado = !estado.apertura || !!estado.cierre;
  const movTotal = movimientos.reduce((s, m) => s + (m.tipo === "ENTRADA" ? m.monto : -m.monto), 0);

  if (bloqueado) return <AvisoTurno>Abre el turno para registrar entradas y salidas.</AvisoTurno>;

  async function registrar() {
    const val = parseFloat(monto);
    if (!concepto.trim()) { setError("Escribe un concepto."); return; }
    if (isNaN(val) || val <= 0) { setError("El monto debe ser mayor a 0."); return; }
    setError(null); setEnviando(true);
    try {
      const nuevo = await registrarMovimiento(crypto.randomUUID(), tipo, concepto.trim(), val);
      setMovimientos((prev) => [...prev, nuevo]);
      setMonto(""); setConcepto("");
      onCambio();
      void sincronizarTodo();
    } catch (err) {
      setError(mensajeError(err, "No se pudo registrar el movimiento."));
    } finally {
      setEnviando(false);
    }
  }

  async function quitar(id: string) {
    try {
      await eliminarMovimiento(id);
      setMovimientos((prev) => prev.filter((m) => m.id !== id));
      onCambio();
      void sincronizarTodo();
    } catch (err) {
      setError(mensajeError(err, "No se pudo eliminar el movimiento."));
    }
  }

  return (
    <div className="sub-scroll two-col">
      <div className="panel">
        <div className="panel-head">Registrar movimiento</div>
        {error && <div className="note-box warn" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="fld">
          <span className="fld-lbl">Tipo</span>
          <div className="pick-row">
            <button className={`pick-btn ${tipo === TipoMovimientoCaja.ENTRADA ? "active" : ""}`}
              onClick={() => setTipo(TipoMovimientoCaja.ENTRADA)}>Entrada</button>
            <button className={`pick-btn ${tipo === TipoMovimientoCaja.GASTO ? "active" : ""}`}
              onClick={() => setTipo(TipoMovimientoCaja.GASTO)}>Salida</button>
          </div>
        </div>
        <label className="fld">
          <span className="fld-lbl">Monto</span>
          <div className="fld-box">
            <IcoBanknote size={17} />
            <input inputMode="decimal" value={monto} placeholder="0.00"
              onChange={(e) => setMonto(e.target.value.replace(/[^0-9.]/g, ""))} />
          </div>
        </label>
        <label className="fld">
          <span className="fld-lbl">Concepto</span>
          <div className="fld-box">
            <input value={concepto} placeholder={tipo === "GASTO" ? "Ej. pago proveedor tortillas" : "Ej. cambio adicional"}
              onChange={(e) => setConcepto(e.target.value)} />
          </div>
        </label>
        <button className="btn primary block" disabled={bloqueado || enviando || !monto || !concepto.trim()}
          onClick={() => void registrar()}>
          <IcoCheck size={17} /> Registrar {tipo === "GASTO" ? "salida" : "entrada"}
        </button>
      </div>

      <div className="panel">
        <div className="panel-head">Movimientos del turno</div>
        {movimientos.length === 0 ? (
          <div className="muted small">Sin movimientos registrados.</div>
        ) : (
          <table className="mini-table">
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="mt-time">{hora(m.creadoEn)}</td>
                  <td><span className={`mv-tag ${m.tipo === "GASTO" ? "out" : "in"}`}>{m.tipo === "GASTO" ? "Salida" : "Entrada"}</span></td>
                  <td className="mt-desc">{m.concepto}</td>
                  <td className={`mt-amt ${m.tipo === "GASTO" ? "neg" : "pos"}`}>{m.tipo === "GASTO" ? "−" : "+"}{peso(m.monto)}</td>
                  <td style={{ width: 28 }}>
                    <button className="btn sm ghost" style={{ height: 26, padding: "0 6px" }} title="Eliminar"
                      onClick={() => void quitar(m.id)}><IcoTrash size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {movimientos.length > 0 && (
          <div className="arq-row total"><span>Neto</span><span>{movTotal < 0 ? "−" : "+"}{peso(Math.abs(movTotal))}</span></div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Ventas del turno
// ---------------------------------------------------------------------------
function SubVentas({ estado }: { estado: EstadoCaja }) {
  const [datos, setDatos] = useState<VentasDia | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { setDatos(await getVentasDia()); } catch (err) { setError(mensajeError(err, "No se pudieron cargar las ventas.")); }
    })();
  }, []);

  const ventas = estado.ventasDelDia;
  if (!ventas) return <AvisoTurno>Abre el turno para ver las ventas.</AvisoTurno>;

  const metodos = [
    { id: "efectivo", nombre: "Efectivo", icon: <IcoBanknote size={18} />, monto: ventas.ventasEfectivo },
    { id: "tarjeta", nombre: "Tarjeta", icon: <IcoCard size={18} />, monto: ventas.ventasTarjeta },
    { id: "transfer", nombre: "Transferencia", icon: <IcoSwap size={18} />, monto: ventas.ventasTransfer },
  ];
  const total = ventas.totalVentas || 1;

  return (
    <div className="sub-scroll">
      {error && <div className="note-box warn" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="stat-row two">
        <div className="stat-card lg">
          <div className="stat-lbl">Ventas del turno</div>
          <div className="stat-val">{peso(ventas.totalVentas)}</div>
          <div className="stat-meta">{ventas.numPedidos} pedido{ventas.numPedidos === 1 ? "" : "s"} cobrado{ventas.numPedidos === 1 ? "" : "s"}</div>
        </div>
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-head">Por método de pago</div>
          {metodos.map((m) => {
            const pct = Math.round((m.monto / total) * 100);
            return (
              <div className="pay-row" key={m.id}>
                <div className="pay-ico">{m.icon}</div>
                <div className="pay-main">
                  <div className="pay-top"><span>{m.nombre}</span><strong>{peso(m.monto)}</strong></div>
                  <div className="pay-bar"><span style={{ width: `${pct}%` }} /></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panel-head">Lista de ventas</div>
        {!datos ? <div className="muted small">Cargando…</div> : datos.pedidos.length === 0 ? (
          <div className="muted small">Aún no hay ventas hoy.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Folio</th><th>Hora</th><th>Método</th><th>Estado</th><th className="ta-r">Total</th></tr>
            </thead>
            <tbody>
              {datos.pedidos.map((p) => {
                const cancelado = p.estado === "CANCELADO";
                return (
                  <tr key={p.id} style={cancelado ? { opacity: 0.55 } : undefined}>
                    <td className="td-strong">#{String(p.folio).padStart(3, "0")}</td>
                    <td className="mt-time">{hora(p.creadoEn)}</td>
                    <td className="mt-desc">{p.metodoPago ? ETIQUETA_METODO[p.metodoPago] : "—"}</td>
                    <td className="mt-desc">{cancelado ? "Cancelado" : "Cobrado"}</td>
                    <td className="ta-r td-strong">{peso(cancelado ? 0 : p.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Cancelaciones (por folio) — reversa real de inventario/reembolso
// ---------------------------------------------------------------------------
function SubCancelaciones({ estado, onCambio }: { estado: EstadoCaja; onCambio: () => void }) {
  const [pedidos, setPedidos] = useState<PedidoActivo[]>([]);
  const [folio, setFolio] = useState("");
  const [target, setTarget] = useState<PedidoActivo | { notFound: true; folio: number } | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelables = pedidos.filter(
    (p) => p.estado === EstadoPedido.PENDIENTE || p.estado === EstadoPedido.LISTO,
  );

  // La lista de cancelables se toma del SERVIDOR (estado real), no de la base local: un
  // pedido ya entregado no debe aparecer como abierto aunque la copia local esté rezagada.
  // Cancelar ya requiere conexión de todos modos (reversa de inventario/reembolso).
  const recargar = async () => {
    try { setPedidos(await cargarPedidosActivos()); } catch (err) { setError(mensajeError(err, "No se pudieron cargar los pedidos.")); }
  };
  useEffect(() => { void recargar(); }, []);

  if (!estado.apertura || estado.cierre) {
    return <AvisoTurno>Abre el turno para cancelar pedidos.</AvisoTurno>;
  }

  function buscar() {
    const f = parseInt(folio, 10);
    const found = cancelables.find((p) => p.folio === f);
    setTarget(found ?? { notFound: true, folio: f });
    setMotivo(null);
  }

  async function cancelar() {
    if (!target || "notFound" in target || !motivo) return;
    setCancelando(true); setError(null);
    try {
      // Cancelación real: el servidor revierte el inventario y registra reembolso si estaba
      // cobrado. El motivo se elige pero aún no se persiste (falta campo en el backend).
      await actualizarEstado(target.id, EstadoPedido.CANCELADO);
      await recargar();
      onCambio();
      setTarget(null); setMotivo(null); setFolio("");
    } catch (err) {
      setError(mensajeError(err, `No se pudo cancelar el folio #${String(target.folio).padStart(3, "0")}.`));
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="sub-scroll two-col">
      <div className="panel">
        <div className="panel-head">Buscar por folio</div>
        {error && <div className="note-box warn" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="folio-row">
          <div className="fld-box">
            <IcoReceipt size={17} />
            <input inputMode="numeric" value={folio} placeholder="Número de folio"
              onChange={(e) => setFolio(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>
          <button className="btn" disabled={!folio} onClick={buscar}>Buscar</button>
        </div>

        {target && "notFound" in target && (
          <div className="note-box warn" style={{ marginTop: 12 }}>
            No hay pedido cancelable con folio #{String(target.folio).padStart(3, "0")}.
          </div>
        )}

        {target && !("notFound" in target) && (
          <div className="cancel-target">
            <div className="ct-top">
              <span className="kb-folio">#{String(target.folio).padStart(3, "0")}</span>
              <span className="pill am">{target.estado === "LISTO" ? "Listo" : "En preparación"}</span>
            </div>
            <div className="ct-meta">{hora(target.creadoEn)} · <strong>{peso(target.total)}</strong></div>
            <div className="fld-lbl" style={{ marginTop: 14 }}>Motivo de cancelación</div>
            <div className="pick-row wrap">
              {MOTIVOS.map((m) => (
                <button key={m} className={`pick-btn ${motivo === m ? "active" : ""}`} onClick={() => setMotivo(m)}>{m}</button>
              ))}
            </div>
            <button className="btn danger block" style={{ marginTop: 14 }} disabled={!motivo || cancelando}
              onClick={() => void cancelar()}>
              <IcoClose size={17} /> {cancelando ? "Cancelando…" : `Cancelar pedido #${String(target.folio).padStart(3, "0")}`}
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">Pedidos abiertos</div>
        <div className="open-list">
          {cancelables.length === 0 ? (
            <div className="kb-empty">Sin pedidos abiertos</div>
          ) : cancelables.map((p) => (
            <div className={`open-row ${target && !("notFound" in target) && target.folio === p.folio ? "sel" : ""}`} key={p.id}>
              <div>
                <div className="kb-folio">#{String(p.folio).padStart(3, "0")}</div>
                <div className="muted small">{hora(p.creadoEn)} · {p.estado === "LISTO" ? "Listo" : "En preparación"}</div>
              </div>
              <div className="open-end">
                <span className="kb-total">{peso(p.total)}</span>
                <button className="link-danger" onClick={() => { setTarget(p); setMotivo(null); setFolio(String(p.folio)); }}>Cancelar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel con el desglose de un corte. Lo comparten la pantalla de corte y la de cierre:
// es literalmente el mismo cálculo (RN-23), así que también debe ser la misma tabla.
// ---------------------------------------------------------------------------
function DesgloseCorte({ estado }: { estado: EstadoCaja }) {
  const ventas = estado.ventasDelDia;
  const apertura = estado.apertura;
  if (!ventas || !apertura) return null;

  const { entradas, gastos } = estado.totalesMovimientos;

  return (
    <>
      <div className="panel">
        <div className="panel-head">Resumen del turno</div>
        <div className="arq-row"><span>Apertura</span><span>{hora(apertura.abiertoEn)}</span></div>
        <div className="arq-row"><span>Pedidos cobrados</span><span>{ventas.numPedidos}</span></div>
        <div className="arq-row"><span>Efectivo</span><span>{peso(ventas.ventasEfectivo)}</span></div>
        <div className="arq-row"><span>Tarjeta</span><span>{peso(ventas.ventasTarjeta)}</span></div>
        <div className="arq-row"><span>Transferencia</span><span>{peso(ventas.ventasTransfer)}</span></div>
        <div className="arq-row total"><span>Ventas totales</span><span>{peso(ventas.totalVentas)}</span></div>
      </div>

      <div className="panel">
        <div className="panel-head">Efectivo esperado</div>
        <div className="arq-row"><span>Fondo inicial</span><span>{peso(apertura.fondoInicial)}</span></div>
        <div className="arq-row"><span>+ Ventas en efectivo</span><span>{peso(ventas.ventasEfectivo)}</span></div>
        {entradas > 0 && <div className="arq-row"><span>+ Entradas</span><span>{peso(entradas)}</span></div>}
        {gastos > 0 && <div className="arq-row"><span>− Salidas</span><span>−{peso(gastos)}</span></div>}
        <div className="arq-row total">
          <span>Efectivo esperado</span><span>{peso(estado.esperadoEnCaja ?? 0)}</span>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub: Generar corte (RN-23)
//
// Solo lectura. No cierra el turno ni escribe nada: es el conteo de control que el
// personal hace a media jornada. Se puede repetir cuantas veces haga falta.
// ---------------------------------------------------------------------------
function SubCorte({ fecha, sucursalNombre }: { fecha: string; sucursalNombre: string }) {
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setEstado(await getEstadoCaja(fecha));
      } catch (err) {
        setError(mensajeError(err, "No se pudo cargar el corte."));
      }
    })();
  }, [fecha]);

  async function imprimir() {
    setError(null); setListo(false); setImprimiendo(true);
    try {
      await imprimirCorte(sucursalNombre, fecha);
      setListo(true);
    } catch (err) {
      setError(mensajeError(err, "No se pudo imprimir el corte."));
    } finally {
      setImprimiendo(false);
    }
  }

  if (!estado) {
    return <div className="sub-scroll"><div className="muted small">Cargando…</div></div>;
  }
  if (!estado.apertura) {
    return <AvisoTurno>Ese día no tuvo apertura de caja: no hay corte que generar.</AvisoTurno>;
  }

  const cerrado = !!estado.cierre;

  return (
    <div className="sub-scroll two-col">
      <DesgloseCorte estado={estado} />

      <div className="panel">
        <div className="panel-head">Imprimir</div>
        {error && <div className="note-box warn" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="arq-row">
          <span>Tipo de corte</span>
          <span>{cerrado ? "Final" : "Parcial"}</span>
        </div>
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={imprimiendo}
          onClick={() => void imprimir()}>
          <IcoPrint size={17} /> {imprimiendo ? "Imprimiendo…" : "Imprimir corte"}
        </button>
        {listo && (
          <div className="note-box" style={{ marginTop: 12 }}>
            <IcoCheck size={15} /> Corte enviado.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub: Cierre de turno
//
// Escribe una sola vez: sella los movimientos del día y congela el snapshot. Recibe la
// fecha porque también sirve para cerrar un turno anterior que quedó abierto (RN-24).
// ---------------------------------------------------------------------------
function SubCierre({
  fecha, sucursalNombre, onCerrado,
}: { fecha: string; sucursalNombre: string; onCerrado: () => void }) {
  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setEstado(await getEstadoCaja(fecha));
      } catch (err) {
        setError(mensajeError(err, "No se pudo cargar el estado de caja."));
      }
    })();
  }, [fecha]);

  async function cerrar() {
    setError(null); setEnviando(true);
    try {
      await cerrarDia(crypto.randomUUID(), fecha, notas.trim() || undefined);
      void sincronizarTodo();

      // El ticket se arma DESPUÉS de cerrar y desde la base: así imprime el snapshot ya
      // sellado, no los números en memoria de esta pantalla.
      await dispararImpresionCierre(await armarCorte(sucursalNombre, fecha));
      onCerrado();
    } catch (err) {
      setError(mensajeError(err, "No se pudo registrar el cierre."));
    } finally {
      setEnviando(false);
    }
  }

  if (!estado) {
    return <div className="sub-scroll"><div className="muted small">Cargando…</div></div>;
  }

  // Día ya cerrado: mostrar el corte tal como quedó.
  if (estado.cierre) {
    const c = estado.cierre;
    return (
      <div className="sub-scroll two-col">
        <div className="panel">
          <div className="panel-head">Ventas del corte</div>
          <div className="arq-row"><span>Efectivo</span><span>{peso(c.ventasEfectivo)}</span></div>
          <div className="arq-row"><span>Tarjeta</span><span>{peso(c.ventasTarjeta)}</span></div>
          <div className="arq-row"><span>Transferencia</span><span>{peso(c.ventasTransfer)}</span></div>
          <div className="arq-row total"><span>Total ventas</span><span>{peso(c.totalVentas)}</span></div>
        </div>
        <div className="panel">
          <div className="panel-head">Efectivo esperado · {fechaLegible(c.cerradoEn)}</div>
          <div className="arq-row"><span>Fondo inicial</span><span>{peso(c.fondoInicial)}</span></div>
          <div className="arq-row total"><span>Esperado en caja</span><span>{peso(c.esperadoEnCaja)}</span></div>
        </div>
      </div>
    );
  }

  if (!estado.apertura || !estado.ventasDelDia) {
    return <AvisoTurno>Abre el turno antes de poder cerrarlo.</AvisoTurno>;
  }

  return (
    <div className="sub-scroll two-col">
      <DesgloseCorte estado={estado} />

      <div className="panel">
        <div className="panel-head">Cerrar el turno</div>
        {error && <div className="note-box warn" style={{ marginBottom: 12 }}>{error}</div>}

        <label className="fld">
          <span className="fld-lbl">Notas (opcional)</span>
          <div className="fld-box">
            <input value={notas} placeholder="Observaciones del cierre"
              onChange={(e) => setNotas(e.target.value)} />
          </div>
        </label>

        <button className="btn primary block" style={{ marginTop: 14 }} disabled={enviando}
          onClick={() => void cerrar()}>
          <IcoLock size={17} /> {enviando ? "Cerrando…" : "Cerrar turno e imprimir corte"}
        </button>
      </div>
    </div>
  );
}
