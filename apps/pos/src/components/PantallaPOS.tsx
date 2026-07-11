import { useEffect, useState } from "react";
import { getCatalogFromDB } from "../sync/catalogSync.js";
import { getLocalDB } from "../db/db.js";
import type { CategoriaLocal, ProductoLocal } from "../db/types.js";
import { ConfiguradorCortes } from "./ConfiguradorCortes.js";
import { ConfiguradorDisponibilidad } from "./ConfiguradorDisponibilidad.js";
import { ConfiguradorPollo } from "./ConfiguradorPollo.js";
import { ConfiguradorRapido } from "./ConfiguradorRapido.js";
import { EditarNota } from "./EditarNota.js";
import { VistaPreviewTicket } from "./VistaPreviewTicket.js";
import { IcoBag, IcoMinus, IcoPlus, IcoTrash, IcoPencil, IcoPrint, IcoOnline, IcoOffline } from "./Iconos.js";
import { type BorradorPedido, type ItemBorrador, type CorteBorrador } from "../types/pedido.js";
import { MetodoPago, OrigenPedido, EstadoPedido } from "@brasas/shared";
import { peekFolio, avanzarFolio } from "../services/folio.js";
import { guardarPedido, sincronizarPedido } from "../services/pedidoService.js";
import { buildDatosImpresion, dispararImpresion, type TipoEntrega } from "../services/print.js";
import { useOnlineStatus } from "../hooks/useOnlineStatus.js";
import { VistaPedidos } from "./VistaPedidos.js";
import { VistaCaja } from "./VistaCaja.js";
import type { OpcionesPedido } from "./VistaPreviewTicket.js";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type ProductoKind = "meat" | "aderezo" | "torta" | "pollo" | "quick";
type ModalState =
  | { tipo: "cortes"; producto: ProductoLocal }
  | { tipo: "rapido"; producto: ProductoLocal; variante?: "aderezo" | "torta" }
  | { tipo: "pollo"; producto: ProductoLocal }
  | { tipo: "nota"; item: ItemBorrador }
  | { tipo: "ticket" }
  | { tipo: "caja" }
  | { tipo: "disponibilidad" }
  | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CLAVE_DISP = "variant_disponible_overrides";

async function leerOverrides(): Promise<Record<string, boolean>> {
  const db = await getLocalDB();
  const raw = await db.getConfig(CLAVE_DISP);
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, boolean>; } catch { return {}; }
}

async function guardarOverrides(ov: Record<string, boolean>): Promise<void> {
  const db = await getLocalDB();
  await db.setConfig(CLAVE_DISP, JSON.stringify(ov));
}

function fmt(n: number) {
  return "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 0 });
}

function detectarKind(producto: ProductoLocal, cat?: CategoriaLocal): ProductoKind {
  if (producto.requiereCorte) return "meat";
  const n = cat?.nombre.toLowerCase() ?? "";
  if (n.includes("boneless") || n.includes("tender")) return "aderezo";
  if (n.includes("torta")) return "torta";
  if (n.includes("pollo")) return "pollo";
  return "quick";
}

function resumenCortes(item: ItemBorrador): string {
  if (item.cortes.length === 0) return "";
  if (item.cortes.length === 1) return item.cortes[0]!.variante.nombre;
  return item.cortes.map((c) => c.variante.nombre).join(" · ") + " (mezcla)";
}

function useScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1280, window.innerHeight / 800, 1.6));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

// ---------------------------------------------------------------------------
// PantallaPOS
// ---------------------------------------------------------------------------
export function PantallaPOS() {
  const [categorias, setCategorias] = useState<CategoriaLocal[]>([]);
  const [productos, setProductos] = useState<ProductoLocal[]>([]);
  const [catActiva, setCatActiva] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<BorradorPedido>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [folio, setFolio] = useState(1);
  const [sucursalId, setSucursalId] = useState("");
  const [sucursalNombre, setSucursalNombre] = useState("Sucursal");
  const [vistaActiva, setVistaActiva] = useState<"venta" | "pedidos">("venta");
  const online = useOnlineStatus();
  const scale = useScale();

  useEffect(() => { void cargar(); }, []);

  async function cargar() {
    const db = await getLocalDB();
    const [{ categorias: cats, productos: prods }, ovs, nextFolio, sid, snombre] = await Promise.all([
      getCatalogFromDB(),
      leerOverrides(),
      peekFolio(),
      db.getConfig("sucursal_id"),
      db.getConfig("sucursal_nombre"),
    ]);
    setCategorias(cats);
    setProductos(prods);
    setOverrides(ovs);
    setFolio(nextFolio);
    if (sid) setSucursalId(sid);
    if (snombre) setSucursalNombre(snombre);
    if (cats.length > 0) setCatActiva(cats[0]!.id);
  }

  // Aplica overrides de disponibilidad por NOMBRE de corte (aplica a todos los paquetes)
  const productosConOv = productos.map((p) => ({
    ...p,
    variantes: p.variantes.map((v) => ({
      ...v,
      activo: v.nombre in overrides ? (overrides[v.nombre] ?? true) : v.activo,
    })),
  }));

  // Cortes únicos extraídos de todos los productos (para el panel de disponibilidad)
  const cortesUnicos: { nombre: string; grupoPrecio: number }[] = [];
  for (const p of productos) {
    for (const v of p.variantes) {
      if (v.grupoPrecio != null && !cortesUnicos.some((c) => c.nombre === v.nombre)) {
        cortesUnicos.push({ nombre: v.nombre, grupoPrecio: v.grupoPrecio });
      }
    }
  }
  cortesUnicos.sort((a, b) => a.grupoPrecio - b.grupoPrecio || a.nombre.localeCompare(b.nombre));

  async function toggleCorteGlobal(nombre: string) {
    const actual = nombre in overrides ? (overrides[nombre] ?? true) : true;
    const nuevos = { ...overrides, [nombre]: !actual };
    setOverrides(nuevos);
    await guardarOverrides(nuevos);
  }

  const catMap = Object.fromEntries(categorias.map((c) => [c.id, c]));
  const prodsDeCat = productosConOv.filter((p) => p.categoriaId === catActiva);
  const catActual = catActiva ? catMap[catActiva] : undefined;

  // Categorías con fotos (placeholder visual)
  const fotosCategoria = (catActual?.nombre.toLowerCase() ?? "").match(/carne|pollo|prom/);

  function onClickProducto(producto: ProductoLocal) {
    const cat = catMap[producto.categoriaId];
    const kind = detectarKind(producto, cat);
    if (kind === "meat") {
      setModal({ tipo: "cortes", producto });
    } else if (kind === "aderezo") {
      setModal({ tipo: "rapido", producto, variante: "aderezo" });
    } else if (kind === "torta") {
      setModal({ tipo: "rapido", producto, variante: "torta" });
    } else if (kind === "pollo") {
      setModal({ tipo: "pollo", producto });
    } else {
      setModal({ tipo: "rapido", producto });
    }
  }

  function agregarItem(
    producto: ProductoLocal,
    cortes: CorteBorrador[],
    cantidad: number,
    notas: string,
    precioOverride?: number
  ) {
    const precioUnitario = precioOverride ?? producto.precio;
    setBorrador((prev) => [
      ...prev,
      { id: crypto.randomUUID(), producto: { ...producto, precio: precioUnitario }, cantidad, cortes, notas },
    ]);
    setModal(null);
  }

  function agregarPollo(producto: ProductoLocal, cantidadPollo: number, notas: string, cantidadPapas: number | null) {
    const items: ItemBorrador[] = [
      { id: crypto.randomUUID(), producto, cantidad: cantidadPollo, cortes: [], notas },
    ];
    if (cantidadPapas !== null) {
      const extraPapas = productos.find((p) => p.nombre === "Extra Papas");
      if (extraPapas) {
        items.push({ id: crypto.randomUUID(), producto: extraPapas, cantidad: cantidadPapas, cortes: [], notas: "" });
      }
    }
    setBorrador((prev) => [...prev, ...items]);
    setModal(null);
  }

  function cambiarCantidad(id: string, delta: number) {
    setBorrador((prev) =>
      prev.map((i) => i.id === id ? { ...i, cantidad: i.cantidad + delta } : i)
          .filter((i) => i.cantidad > 0)
    );
  }

  function guardarNota(id: string, nota: string) {
    setBorrador((prev) => prev.map((i) => i.id === id ? { ...i, notas: nota } : i));
    setModal(null);
  }

  async function confirmarCobro(metodoPago: MetodoPago, opciones: OpcionesPedido) {
    const { tipoEntrega, clienteId, nombreRecoger, horaRecoger, direccionEntrega, referenciaEntrega } = opciones;
    const folioAsignado = await avanzarFolio();
    const ahora = new Date().toISOString();
    const origenDB = tipoEntrega === "DOMICILIO" ? OrigenPedido.DELIVERY
      : tipoEntrega === "RECOGER" ? OrigenPedido.TELEFONO
      : OrigenPedido.MOSTRADOR;

    let horaRecoleccionISO: string | undefined;
    if (horaRecoger) {
      const [h, m] = horaRecoger.split(":").map(Number);
      const dt = new Date();
      dt.setHours(h!, m!, 0, 0);
      horaRecoleccionISO = dt.toISOString();
    }

    const pedido = {
      id: crypto.randomUUID(),
      folio: folioAsignado,
      sucursalId,
      ...(clienteId !== undefined && { clienteId }),
      ...(nombreRecoger !== undefined && { notas: nombreRecoger }),
      ...(horaRecoleccionISO !== undefined && { horaRecoleccion: horaRecoleccionISO }),
      origen: origenDB,
      estado: EstadoPedido.PENDIENTE,
      metodoPago,
      total: borrador.reduce((s, i) => s + i.producto.precio * i.cantidad, 0),
      creadoEn: ahora,
      actualizadoEn: ahora,
      sincronizado: false,
      items: borrador.map((item) => ({
        id: item.id,
        productoId: item.producto.id,
        cantidad: item.cantidad,
        precioUnitario: item.producto.precio,
        ...(item.notas !== undefined && { notas: item.notas }),
        selecciones: item.cortes.map((c) => ({
          id: crypto.randomUUID(),
          varianteId: c.variante.id,
          proporcion: c.proporcion,
        })),
      })),
    };

    await guardarPedido(pedido);
    void sincronizarPedido(pedido);

    const datosImpresion = buildDatosImpresion(
      borrador, folioAsignado, sucursalNombre, origenDB, metodoPago,
      undefined, tipoEntrega, nombreRecoger, horaRecoger, direccionEntrega, referenciaEntrega,
    );
    void dispararImpresion(datosImpresion);

    setBorrador([]);
    setFolio(await peekFolio());
    setModal(null);
  }

  const totalItems = borrador.reduce((s, i) => s + i.cantidad, 0);
  const totalMoney = borrador.reduce((s, i) => s + i.producto.precio * i.cantidad, 0);
  const fecha = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });

  return (
    <div className="pos-stage">
      <div className="pos-frame" style={{ transform: `scale(${scale})` }}>
        {/* ===== HEADER ===== */}
        <header className="pos-header">
          <div className="brand">
            <div className="brand-mark">B</div>
            <span className="brand-name">Las Brasas</span>
            <span className="brand-sub">{catActual?.nombre ?? ""}</span>
          </div>
          <div className="header-meta">
            <span style={{ fontSize: 13, color: "var(--text-3)" }}>{fecha}</span>
            <div className={`chip ${online ? "ok" : "warn"}`}>
              {online ? <IcoOnline size={12} /> : <IcoOffline size={12} />}
              {online ? "En línea" : "Sin conexión"}
            </div>
            <div className="chip">
              Próximo folio <strong>#{String(folio).padStart(3, "0")}</strong>
            </div>
            <button
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                borderRadius: 8, padding: "6px 12px", fontSize: 13,
                fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
              }}
              onClick={() => setModal({ tipo: "disponibilidad" })}
            >
              Disponibilidad
            </button>
            <button
              style={{
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--text-2)", borderRadius: 8, padding: "6px 12px",
                fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--font)",
              }}
              onClick={() => setModal({ tipo: "caja" })}
            >
              Caja
            </button>
            <button
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-2)",
                borderRadius: 8, padding: "6px 14px", fontSize: 13,
                fontWeight: 600, cursor: "pointer", fontFamily: "var(--font)",
              }}
              onClick={() => setVistaActiva("pedidos")}
            >
              Pedidos →
            </button>
          </div>
        </header>

        {/* ===== BODY ===== */}
        <div className="pos-body">
          {/* Catálogo */}
          <div className="catalog-pane">
            <div className="cat-tabs">
              {categorias.map((c) => (
                <button key={c.id}
                  className={`cat-tab ${c.id === catActiva ? "active" : ""}`}
                  onClick={() => setCatActiva(c.id)}>
                  {c.nombre}
                </button>
              ))}
            </div>

            <div className="cat-scroll">
              <div className="section-head">
                <h3>{catActual?.nombre}</h3>
                <span className="count">{prodsDeCat.length} productos</span>
              </div>

              <div className="prod-grid">
                {prodsDeCat.map((prod) => (
                  <ProductoCard key={prod.id} producto={prod}
                    conFoto={!!fotosCategoria}
                    onClick={() => onClickProducto(prod)} />
                ))}
              </div>
            </div>
          </div>

          {/* Carrito */}
          <div className="cart-pane">
            <div className="cart-head">
              <IcoBag size={18} />
              <span className="title">Pedido</span>
              {totalItems > 0 && (
                <span className="count">· {totalItems} item{totalItems !== 1 ? "s" : ""}</span>
              )}
              {borrador.length > 0 && (
                <button className="link" onClick={() => setBorrador([])}>Vaciar</button>
              )}
            </div>

            {borrador.length === 0 ? (
              <div className="cart-empty" style={{ flex: 1 }}>
                <div className="cart-empty-ico"><IcoBag size={26} /></div>
                <h4>Sin items</h4>
                <p>Selecciona productos del catálogo para armar el pedido. El folio se asigna al cobrar.</p>
              </div>
            ) : (
              <div className="cart-scroll">
                {borrador.map((item) => (
                  <div key={item.id} className="cart-line">
                    <div className="qty">{item.cantidad}</div>
                    <div className="info">
                      <span className="name">{item.producto.nombre}</span>
                      {item.producto.descripcion && (
                        <span className="meta">{item.producto.descripcion}</span>
                      )}
                      {item.cortes.length > 0 && (
                        <span className="meta accent">{resumenCortes(item)}</span>
                      )}
                      {item.notas && (
                        <span className="meta italic">"{item.notas}"</span>
                      )}
                    </div>
                    <div className="price">{fmt(item.producto.precio * item.cantidad)}</div>
                    <div className="controls">
                      <button onClick={() => cambiarCantidad(item.id, -1)} title="Restar">
                        <IcoMinus size={14} />
                      </button>
                      <button onClick={() => cambiarCantidad(item.id, 1)} title="Sumar">
                        <IcoPlus size={14} />
                      </button>
                      <button className="note" onClick={() => setModal({ tipo: "nota", item })}>
                        <IcoPencil size={12} style={{ marginRight: 6 }} />
                        {item.notas ? "Editar nota" : "Agregar nota"}
                      </button>
                      <button className="del" onClick={() => setBorrador((p) => p.filter((i) => i.id !== item.id))}>
                        <IcoTrash size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="cart-foot">
              <div className="totrow"><span>Items</span><span className="v">{totalItems}</span></div>
              <div className="totrow grand"><span>Total</span><span className="v">{fmt(totalMoney)}</span></div>
              <button className="btn primary block"
                disabled={borrador.length === 0}
                onClick={() => setModal({ tipo: "ticket" })}>
                <IcoPrint size={20} /> Cobrar e imprimir
              </button>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)" }}>
                <span>Próximo folio</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)", fontWeight: 600 }}>
                  #{String(folio).padStart(3, "0")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== MODALES ===== */}
        {modal?.tipo === "cortes" && (
          <ConfiguradorCortes
            producto={modal.producto}
            onConfirmar={(cortes, cantidad, notas) =>
              agregarItem(modal.producto, cortes, cantidad, notas)}
            onCancelar={() => setModal(null)}
          />
        )}
        {modal?.tipo === "rapido" && (
          <ConfiguradorRapido
            producto={modal.producto}
            variantes={modal.variante}
            onConfirmar={(opcionId, cantidad, notas) =>
              agregarItem(modal.producto, [], cantidad, notas)}
            onCancelar={() => setModal(null)}
          />
        )}
        {modal?.tipo === "pollo" && (
          <ConfiguradorPollo
            producto={modal.producto}
            onConfirmar={(cantidadPollo, notas, cantidadPapas) =>
              agregarPollo(modal.producto, cantidadPollo, notas, cantidadPapas)}
            onCancelar={() => setModal(null)}
          />
        )}
        {modal?.tipo === "nota" && (
          <EditarNota
            nombreItem={modal.item.producto.nombre}
            notaActual={modal.item.notas ?? ""}
            onGuardar={(nota) => guardarNota(modal.item.id, nota)}
            onCancelar={() => setModal(null)}
          />
        )}
        {modal?.tipo === "ticket" && (
          <VistaPreviewTicket
            items={borrador}
            folio={folio}
            sucursal={sucursalNombre}
            onCerrar={() => setModal(null)}
            onConfirmar={(mp, opciones) => void confirmarCobro(mp, opciones)}
          />
        )}

        {modal?.tipo === "caja" && (
          <VistaCaja
            sucursalNombre={sucursalNombre}
            onCerrar={() => setModal(null)}
          />
        )}

        {modal?.tipo === "disponibilidad" && (
          <ConfiguradorDisponibilidad
            cortes={cortesUnicos}
            overrides={overrides}
            onToggle={(nombre) => void toggleCorteGlobal(nombre)}
            onCerrar={() => setModal(null)}
          />
        )}

        {vistaActiva === "pedidos" && (
          <VistaPedidos
            sucursalId={sucursalId}
            sucursalNombre={sucursalNombre}
            onVolver={() => setVistaActiva("venta")}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProductoCard
// ---------------------------------------------------------------------------
interface CardProps {
  producto: ProductoLocal;
  conFoto: boolean;
  onClick: () => void;
}

function ProductoCard({ producto, conFoto, onClick }: CardProps) {
  return (
    <button className="prod-card" onClick={onClick}>
      {conFoto && (
        <div className="photo">
          <span>{producto.nombre.slice(0, 10)}</span>
        </div>
      )}
      <span className="pname">{producto.nombre}</span>
      {producto.descripcion && <span className="psub">{producto.descripcion}</span>}
      {!producto.requiereCorte && producto.precio > 0 && (
        <span className="pprice">
          {"$" + producto.precio.toLocaleString("es-MX", { minimumFractionDigits: 0 })}
        </span>
      )}
    </button>
  );
}
