import { useEffect, useState, useCallback } from "react";
import { EstadoPedido, OrigenPedido } from "@brasas/shared";
import { cargarPedidosActivos, actualizarEstado, type PedidoActivo } from "../services/pedidoEstado.js";
import { suscribirPedidos } from "../services/realtime.js";
import { mensajeError } from "../lib/api.js";
import { IcoCheck, IcoClose, IcoChevron } from "./Iconos.js";

// Ventana en la que un pedido programado pasa a ser trabajo activo de cocina. Antes de
// esto espera en el subgrupo "Programados · más tarde" para no saturar "En preparación".
const VENTANA_MIN = 30;

function minutosPara(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 60000;
}
function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", {
    timeZone: "America/Mazatlan", hour: "2-digit", minute: "2-digit",
  });
}
// Un pedido programado entra a la zona activa cuando faltan ≤30 min para su hora (o ya
// pasó). Los que no tienen hora son inmediatos: siempre activos.
function esProgramadoEnEspera(p: PedidoActivo): boolean {
  return p.horaRecoleccion != null && minutosPara(p.horaRecoleccion) > VENTANA_MIN;
}
// Orden de la zona activa: inmediatos (sin hora) arriba por antigüedad; luego los
// programados en ventana, por cercanía de su hora.
function ordenActivo(a: PedidoActivo, b: PedidoActivo): number {
  const ha = a.horaRecoleccion ? new Date(a.horaRecoleccion).getTime() : null;
  const hb = b.horaRecoleccion ? new Date(b.horaRecoleccion).getTime() : null;
  if (ha === null && hb === null) return new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime();
  if (ha === null) return -1;
  if (hb === null) return 1;
  return ha - hb;
}
type TonoHora = "urgente" | "programado" | "info";
function tonoHora(p: PedidoActivo, colKey: string, enEspera: boolean): TonoHora | null {
  if (p.horaRecoleccion == null) return null;
  if (enEspera) return "programado";
  return colKey === "prep" ? "urgente" : "info";
}

interface Props {
  sucursalId: string;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

function haceMin(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h`;
}

// Mapeo canal (etiqueta del diseño) ⇆ origen real del pedido. Decisión de negocio:
// Mostrador→MOSTRADOR, Para llevar→TELEFONO, A domicilio→DELIVERY, y WhatsApp propio.
const CANAL_INFO: Record<OrigenPedido, { label: string; tone: string }> = {
  [OrigenPedido.MOSTRADOR]: { label: "Mostrador", tone: "" },
  [OrigenPedido.TELEFONO]: { label: "Para llevar", tone: "am" },
  [OrigenPedido.WHATSAPP]: { label: "WhatsApp", tone: "bl" },
  [OrigenPedido.DELIVERY]: { label: "A domicilio", tone: "bl" },
};

type Filtro = "TODOS" | OrigenPedido;

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "TODOS", label: "Todos" },
  { key: OrigenPedido.MOSTRADOR, label: "Mostrador" },
  { key: OrigenPedido.TELEFONO, label: "Para llevar" },
  { key: OrigenPedido.DELIVERY, label: "A domicilio" },
  { key: OrigenPedido.WHATSAPP, label: "WhatsApp" },
];

interface Columna {
  key: string;
  estado: EstadoPedido;
  label: string;
}

const COLUMNAS: Columna[] = [
  { key: "prep", estado: EstadoPedido.PENDIENTE, label: "En preparación" },
  { key: "listo", estado: EstadoPedido.LISTO, label: "Listos" },
  { key: "entregado", estado: EstadoPedido.ENTREGADO, label: "Entregados" },
];

// Siguiente estado y etiqueta del botón, respetando las transiciones válidas por origen
// (el servidor las valida en esTransicionValida). Mostrador salta "Listo".
function siguientePaso(p: PedidoActivo): { siguiente: EstadoPedido; label: string } | null {
  if (p.estado === EstadoPedido.PENDIENTE) {
    if (p.origen === OrigenPedido.MOSTRADOR) {
      return { siguiente: EstadoPedido.ENTREGADO, label: "Marcar entregado" };
    }
    return { siguiente: EstadoPedido.LISTO, label: "Marcar listo" };
  }
  if (p.estado === EstadoPedido.LISTO) {
    const label = p.origen === OrigenPedido.DELIVERY ? "Marcar enviado" : "Marcar entregado";
    return { siguiente: EstadoPedido.ENTREGADO, label };
  }
  return null;
}

function esCancelable(p: PedidoActivo): boolean {
  return p.estado === EstadoPedido.PENDIENTE || p.estado === EstadoPedido.LISTO;
}

export function VistaPedidos({ sucursalId }: Props) {
  const [pedidos, setPedidos] = useState<PedidoActivo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [progExpandido, setProgExpandido] = useState(false);
  // Fuerza un re-render periódico para que los pedidos programados crucen la ventana de
  // 30 min sin depender de que llegue un evento del servidor.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const cargar = useCallback(async () => {
    try {
      setPedidos(await cargarPedidosActivos());
      setError(null);
    } catch (err) {
      setError(mensajeError(err, "No se pudo cargar los pedidos."));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const cancelar = suscribirPedidos(sucursalId, () => void cargar());
    return cancelar;
  }, [sucursalId, cargar]);

  async function avanzar(p: PedidoActivo, siguiente: EstadoPedido) {
    setActualizando(p.id);
    try {
      await actualizarEstado(p.id, siguiente);
      setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, estado: siguiente } : x)));
    } catch (err) {
      setError(mensajeError(err, "No se pudo actualizar el estado."));
    } finally {
      setActualizando(null);
    }
  }

  async function cancelar(p: PedidoActivo) {
    setConfirmandoCancelar(null);
    setActualizando(p.id);
    try {
      await actualizarEstado(p.id, EstadoPedido.CANCELADO);
      setPedidos((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      setError(mensajeError(err, "No se pudo cancelar el pedido."));
    } finally {
      setActualizando(null);
    }
  }

  const visibles = pedidos.filter((p) => filtro === "TODOS" || p.origen === filtro);
  const countPorFiltro = (f: Filtro) =>
    f === "TODOS" ? pedidos.length : pedidos.filter((p) => p.origen === f).length;

  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Pedidos</h1>
        </div>
        <div className="screen-head-actions">
          <div className="seg">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                className={`seg-btn ${filtro === f.key ? "active" : ""}`}
                onClick={() => setFiltro(f.key)}
              >
                {f.label}
                {f.key !== "TODOS" && <span className="seg-n">{countPorFiltro(f.key)}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="note-box warn" style={{ margin: "12px 20px 0" }}>
          {error}
        </div>
      )}

      <div className="kanban">
        {COLUMNAS.map((col) => {
          const lista = visibles.filter((p) => p.estado === col.estado);
          // Solo "En preparación" separa los programados en espera; las demás columnas
          // muestran todo junto (un pedido ya listo/entregado no se pospone).
          const esPrep = col.key === "prep";
          const enEspera = esPrep ? lista.filter(esProgramadoEnEspera) : [];
          const activos = (esPrep ? lista.filter((p) => !esProgramadoEnEspera(p)) : lista)
            .slice()
            .sort(ordenActivo);
          enEspera.sort((a, b) =>
            new Date(a.horaRecoleccion!).getTime() - new Date(b.horaRecoleccion!).getTime());

          const renderCard = (p: PedidoActivo, tono: TonoHora | null) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              tono={tono}
              horaReco={p.horaRecoleccion ? horaLocal(p.horaRecoleccion) : undefined}
              ocupado={actualizando === p.id}
              confirmando={confirmandoCancelar === p.id}
              onAvanzar={(sig) => void avanzar(p, sig)}
              onSolicitarCancelar={() => setConfirmandoCancelar(p.id)}
              onConfirmarCancelar={() => void cancelar(p)}
              onAbortarCancelar={() => setConfirmandoCancelar(null)}
            />
          );

          return (
            <div className="kb-col" key={col.key}>
              <div className="kb-col-head">
                <div className="kb-col-title">
                  <span className={`kb-dot ${col.key}`} />
                  {col.label}
                </div>
                <span className="kb-count">{activos.length}</span>
              </div>
              <div className="kb-cards">
                {cargando ? (
                  <div className="kb-empty">Cargando…</div>
                ) : activos.length === 0 && enEspera.length === 0 ? (
                  <div className="kb-empty">Sin pedidos</div>
                ) : (
                  <>
                    {activos.map((p) => renderCard(p, tonoHora(p, col.key, false)))}
                    {enEspera.length > 0 && (
                      <div className="prog-group">
                        <button className="prog-head" onClick={() => setProgExpandido((v) => !v)}>
                          <IcoChevron size={15}
                            style={{ transform: progExpandido ? "rotate(90deg)" : "none", transition: "transform .12s" }} />
                          <span>Programados · más tarde</span>
                          <span className="prog-count">{enEspera.length}</span>
                        </button>
                        {progExpandido && enEspera.map((p) => renderCard(p, "programado"))}
                      </div>
                    )}
                  </>
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
// Tarjeta de pedido
// ---------------------------------------------------------------------------
interface CardProps {
  pedido: PedidoActivo;
  tono: TonoHora | null;
  horaReco?: string | undefined;
  ocupado: boolean;
  confirmando: boolean;
  onAvanzar: (siguiente: EstadoPedido) => void;
  onSolicitarCancelar: () => void;
  onConfirmarCancelar: () => void;
  onAbortarCancelar: () => void;
}

const ETIQUETA_HORA: Record<TonoHora, string> = {
  urgente: "Preparar ahora",
  programado: "Programado",
  info: "Recoge",
};

function PedidoCard({
  pedido, tono, horaReco, ocupado, confirmando,
  onAvanzar, onSolicitarCancelar, onConfirmarCancelar, onAbortarCancelar,
}: CardProps) {
  const canal = CANAL_INFO[pedido.origen];
  const paso = siguientePaso(pedido);

  return (
    <div className={`kb-card${tono === "programado" ? " prog" : ""}`}>
      <div className="kb-card-top">
        <span className="kb-folio">#{String(pedido.folio).padStart(3, "0")}</span>
        <span className={`kb-chan ${canal.tone}`}>{canal.label}</span>
      </div>
      {tono && horaReco && (
        <div className={`kb-hora ${tono}`}>{ETIQUETA_HORA[tono]} · {horaReco}</div>
      )}
      {pedido.notas && <div className="kb-client">{pedido.notas}</div>}
      <ul className="kb-items">
        {pedido.items.map((it) => (
          <li key={it.id}>
            {it.cantidad}× {it.productoNombre}
          </li>
        ))}
      </ul>
      <div className="kb-card-foot">
        <span className="kb-time">{haceMin(pedido.creadoEn)}</span>
        <span className="kb-total">{fmt(pedido.total)}</span>
      </div>

      {confirmando ? (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button className="btn sm ghost" style={{ flex: 1 }} onClick={onAbortarCancelar}>
            No
          </button>
          <button
            className="btn sm danger"
            style={{ flex: 1 }}
            disabled={ocupado}
            onClick={onConfirmarCancelar}
          >
            Sí, cancelar
          </button>
        </div>
      ) : (
        paso && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="kb-advance"
              disabled={ocupado}
              onClick={() => onAvanzar(paso.siguiente)}
            >
              {ocupado ? "…" : paso.label}
              <IcoCheck size={15} />
            </button>
            {esCancelable(pedido) && (
              <button
                className="btn sm danger"
                title="Cancelar pedido"
                disabled={ocupado}
                style={{ flex: "0 0 40px", marginTop: 10, padding: 0 }}
                onClick={onSolicitarCancelar}
              >
                <IcoClose size={15} />
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
