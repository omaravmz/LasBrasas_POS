import { useEffect, useState } from "react";
import { getCatalogFromDB, syncCatalog } from "../sync/catalogSync.js";
import { getLocalDB } from "../db/db.js";
import type { CategoriaLocal, ProductoLocal, GrupoCorteLocal } from "../db/types.js";
import { precioDeItem, totalDelBorrador } from "../services/precio.js";
import { ConfiguradorCortes } from "./ConfiguradorCortes.js";
import { ConfiguradorDisponibilidad } from "./ConfiguradorDisponibilidad.js";
import { ConfiguradorPollo } from "./ConfiguradorPollo.js";
import { ConfiguradorRapido } from "./ConfiguradorRapido.js";
import { EditarNota } from "./EditarNota.js";
import { VistaPreviewTicket } from "./VistaPreviewTicket.js";
import { IcoBag, IcoMinus, IcoPlus, IcoTrash, IcoPencil, IcoPrint, IcoOnline, IcoOffline, IcoStore, IcoGrid, IcoReceipt, IcoWallet, IcoBox, IcoSun, IcoMoon, IcoPower, IcoLock, IcoBanknote } from "./Iconos.js";
import { TypeMenu, PackageView } from "./MenuMosaico.js";
import { type BorradorPedido, type ItemBorrador, type CorteBorrador } from "../types/pedido.js";
import { OrigenPedido, EstadoPedido, type MetodoPago } from "@brasas/shared";
import { peekFolio } from "../services/folio.js";
import { diaOperativo, fechaOperativaCorta } from "../services/diaOperativo.js";
import { getCatalogoVersion } from "../sync/catalogSync.js";
import { guardarPedido } from "../services/pedidoService.js";
import { abrirDia, getEstadoCaja, getDiasSinCerrar } from "../services/cajaService.js";
import { sincronizarTodo } from "../sync/colaSync.js";
import { buildDatosImpresion, dispararImpresion } from "../services/print.js";
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
  | { tipo: "disponibilidad" }
  | null;

// Pantalla activa del nav rail. Pedidos y Caja son pantallas propias (no modales): la
// lógica ya vive en VistaPedidos / VistaCaja y se conserva tal cual.
type Vista = "vender" | "pedidos" | "caja";

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
  const [gruposCorte, setGruposCorte] = useState<GrupoCorteLocal[]>([]);
  const [folio, setFolio] = useState(1);
  const [sucursalId, setSucursalId] = useState("");
  const [sucursalNombre, setSucursalNombre] = useState("Sucursal");
  const [vista, setVista] = useState<Vista>("vender");
  // Estado del turno para el día operativo actual. Sin turno abierto no se puede vender:
  // la vista Vender se sustituye por la puerta de apertura (RN-08). "cargando" evita
  // parpadear la puerta antes de leer la base local. "pendiente" es RN-24: quedó un turno
  // anterior sin cerrar, así que hoy ni siquiera se puede abrir.
  const [cajaEstado, setCajaEstado] = useState<"cargando" | "sin_abrir" | "abierto" | "cerrado" | "pendiente">("cargando");
  const [diasPendientes, setDiasPendientes] = useState<string[]>([]);
  // Tema claro/oscuro. El valor inicial lo fijó main.tsx en el <html>; aquí solo se
  // sincroniza el estado para reflejar el botón y persistir el cambio.
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const online = useOnlineStatus();
  const scale = useScale();

  useEffect(() => {
    void (async () => {
      // Pinta de inmediato con el catálogo local (offline-first).
      await cargar();
      // Luego refresca desde el servidor y vuelve a leer: si la terminal sincronizó antes
      // de un cambio de catálogo (p. ej. la llegada de los grupos de corte, BD-13), sus
      // datos locales están viejos y hay que releerlos tras el sync. Sin esto, el sync en
      // segundo plano actualizaba la base pero el estado en pantalla se quedaba estancado.
      try {
        await syncCatalog();
        await cargar();
      } catch {
        // Sin conexión: se sigue operando con el catálogo local. Es lo esperado.
      }
    })();
  }, []);

  async function cargar() {
    const db = await getLocalDB();
    const [{ categorias: cats, productos: prods, gruposCorte: gc }, ovs, nextFolio, sid, snombre] = await Promise.all([
      getCatalogFromDB(),
      leerOverrides(),
      peekFolio(),
      db.getConfig("sucursal_id"),
      db.getConfig("sucursal_nombre"),
    ]);
    setCategorias(cats);
    setProductos(prods);
    setGruposCorte(gc);
    setOverrides(ovs);
    setFolio(nextFolio);
    if (sid) setSucursalId(sid);
    if (snombre) setSucursalNombre(snombre);
    // Arranca en el menú de tipos (mosaico nivel 0). Al releer tras un sync NO se fuerza
    // una categoría: si el cajero ya abrió una, se respeta; si estaba en el menú, se queda.
  }

  // Relee el estado del turno desde la base local. Se llama al entrar a Vender —incluido el
  // arranque— y tras abrir el turno, para reflejar de inmediato si ya se puede vender o si
  // el turno se cerró desde la pestaña Caja.
  async function refrescarEstadoCaja() {
    const [e, pendientes] = await Promise.all([getEstadoCaja(), getDiasSinCerrar()]);
    setDiasPendientes(pendientes.map((a) => a.fechaOperativa));

    if (e.apertura) {
      setCajaEstado(e.cierre ? "cerrado" : "abierto");
      return;
    }
    // Sin apertura hoy: si arrastra un turno anterior sin cerrar, la puerta no ofrece
    // abrir — manda a cerrar lo pendiente primero (RN-24).
    setCajaEstado(pendientes.length > 0 ? "pendiente" : "sin_abrir");
  }

  useEffect(() => {
    if (vista === "vender") void refrescarEstadoCaja();
  }, [vista]);

  // Aplica overrides de disponibilidad por NOMBRE de corte (aplica a todos los paquetes)
  const productosConOv = productos.map((p) => ({
    ...p,
    variantes: p.variantes.map((v) => ({
      ...v,
      activo: v.nombre in overrides ? (overrides[v.nombre] ?? true) : v.activo,
    })),
  }));

  // Cortes únicos extraídos de todos los productos (para el panel de disponibilidad)
  const ordenDeGrupo = (id: string): number =>
    gruposCorte.find((g) => g.id === id)?.orden ?? 99;

  const cortesUnicos: { nombre: string; grupoCorteId: string }[] = [];
  for (const p of productos) {
    for (const v of p.variantes) {
      if (v.grupoCorteId != null && !cortesUnicos.some((c) => c.nombre === v.nombre)) {
        cortesUnicos.push({ nombre: v.nombre, grupoCorteId: v.grupoCorteId });
      }
    }
  }
  cortesUnicos.sort(
    (a, b) =>
      ordenDeGrupo(a.grupoCorteId) - ordenDeGrupo(b.grupoCorteId) ||
      a.nombre.localeCompare(b.nombre),
  );

  async function toggleCorteGlobal(nombre: string) {
    const actual = nombre in overrides ? (overrides[nombre] ?? true) : true;
    const nuevos = { ...overrides, [nombre]: !actual };
    setOverrides(nuevos);
    await guardarOverrides(nuevos);
  }

  const catMap = Object.fromEntries(categorias.map((c) => [c.id, c])) as Record<string, CategoriaLocal>;
  const prodsDeCat = productosConOv.filter((p) => p.categoriaId === catActiva);
  const catActual = catActiva ? catMap[catActiva] : undefined;

  // Cuántos productos tiene cada categoría (se muestra en el mosaico nivel 0).
  const countByCat: Record<string, number> = {};
  for (const p of productos) countByCat[p.categoriaId] = (countByCat[p.categoriaId] ?? 0) + 1;

  // Solo se muestran categorías con productos: si una queda vacía (p. ej. "Piezas" tras
  // mover sus promos a Pollos), no aparece como tile hueco en el mosaico.
  const categoriasVisibles = categorias.filter((c) => (countByCat[c.id] ?? 0) > 0);

  function toggleTema() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("pos-theme", next ? "dark" : "light");
  }

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
    // Tras agregar, se regresa al menú de tipos (mosaico nivel 0) para el siguiente producto.
    setCatActiva(null);
  }

  function agregarPollo(producto: ProductoLocal, cantidadPollo: number, notas: string, cantidadPapas: number | null) {
    const items: ItemBorrador[] = [
      { id: crypto.randomUUID(), producto, cantidad: cantidadPollo, cortes: [], notas },
    ];
    if (cantidadPapas !== null) {
      // El seed renombró "Extra Papas" → "Papas Fritas" (orden suelta). Buscar el nombre
      // viejo dejaba de agregar las papas al pollo.
      const extraPapas = productos.find((p) => p.nombre === "Papas Fritas");
      if (extraPapas) {
        items.push({ id: crypto.randomUUID(), producto: extraPapas, cantidad: cantidadPapas, cortes: [], notas: "" });
      }
    }
    setBorrador((prev) => [...prev, ...items]);
    setModal(null);
    // Tras agregar, se regresa al menú de tipos (mosaico nivel 0) para el siguiente producto.
    setCatActiva(null);
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

    // Barrera dura: sin turno abierto no se registra la venta. La UI ya sustituye el
    // catálogo por la puerta de apertura, pero si el turno se cerró mientras el modal de
    // cobro estaba abierto, esto lo ataja antes de guardar un pedido huérfano que el
    // servidor rechazaría con DIA_NO_ABIERTO / DIA_YA_CERRADO.
    const estadoCaja = await getEstadoCaja();
    if (!estadoCaja.apertura || estadoCaja.cierre) {
      setModal(null);
      setCajaEstado(!estadoCaja.apertura ? "sin_abrir" : "cerrado");
      return;
    }

    // El folio se deriva de los pedidos ya guardados: no hay contador aparte que pueda
    // desviarse de los datos. Ver BD-03.
    const folioAsignado = await peekFolio();

    // La terminal estampa el día de operación. El servidor no lo deduce del momento en
    // que recibe el pedido — si lo hiciera, una venta sincronizada de madrugada caería
    // en el día siguiente y descuadraría dos cortes de caja. Ver BD-02.
    const fechaOperativa = diaOperativo();
    const catalogoVersion = await getCatalogoVersion();

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
      fechaOperativa,
      catalogoVersion,
      sucursalId,
      ...(clienteId !== undefined && { clienteId }),
      ...(nombreRecoger !== undefined && { notas: nombreRecoger }),
      ...(horaRecoleccionISO !== undefined && { horaRecoleccion: horaRecoleccionISO }),
      origen: origenDB,
      estado: EstadoPedido.PENDIENTE,
      metodoPago,
      // El precio de un paquete de carne depende del GRUPO del corte elegido (BD-13), así
      // que el total sale de precioDeItem, no de producto.precio.
      //
      // La suma es en centavos enteros, no en punto flotante: el servidor valida que el
      // total coincida exactamente con la suma de las líneas (en Decimal), y un total como
      // 665.5000000000001 haría que RECHAZARA una venta legítima que el cliente ya pagó.
      total: totalDelBorrador(borrador),
      creadoEn: ahora,
      actualizadoEn: ahora,
      sincronizado: false,
      items: borrador.map((item) => ({
        id: item.id,
        productoId: item.producto.id,
        cantidad: item.cantidad,
        precioUnitario: precioDeItem(item),
        ...(item.notas !== undefined && { notas: item.notas }),
        selecciones: item.cortes.map((c) => ({
          id: crypto.randomUUID(),
          varianteId: c.variante.id,
          proporcion: c.proporcion,
        })),
      })),
    };

    await guardarPedido(pedido);
    // La venta ya está guardada en local: lo que sigue es en segundo plano y no puede
    // bloquear el cobro. Se drena la cola entera y en orden —no solo este pedido—
    // porque la apertura del día tiene que llegar al servidor antes que las ventas.
    void sincronizarTodo();

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
  const totalMoney = totalDelBorrador(borrador);
  const fecha = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });

  return (
    <div className="pos-stage">
      <div className="pos-frame" style={{ transform: `scale(${scale})` }}>
        {/* ===== HEADER ===== */}
        <header className="pos-header">
          <div className="brand">
            <div className="brand-mark">B</div>
            <span className="brand-name">Las Brasas</span>
          </div>
          <div className="chip"><IcoStore size={13} />{sucursalNombre}</div>
          <div className="header-meta">
            <span style={{ textTransform: "capitalize" }}>{fecha}</span>
            <div className={`chip ${online ? "ok" : "warn"}`}>
              {online ? <IcoOnline size={12} /> : <IcoOffline size={12} />}
              {online ? "En línea" : "Sin conexión · operando local"}
            </div>
            <div className="chip">
              <span>Folio próximo</span> <strong>#{String(folio).padStart(3, "0")}</strong>
            </div>
            <button className="hdr-btn" onClick={() => setModal({ tipo: "disponibilidad" })}>
              <IcoBox size={15} /> Cortes
            </button>
            <button
              className="hdr-btn icon-only"
              onClick={toggleTema}
              title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {dark ? <IcoSun size={15} /> : <IcoMoon size={15} />}
            </button>
          </div>
        </header>

        {/* ===== MAIN: nav rail + pantalla activa ===== */}
        <div className="pos-main">
          <NavRail vista={vista} onNav={setVista} />

          {vista === "vender" && cajaEstado !== "abierto" && (
            <div className="pos-screen">
              <GateApertura estado={cajaEstado} pendientes={diasPendientes}
                onIrACaja={() => setVista("caja")}
                onAbierto={() => void refrescarEstadoCaja()} />
            </div>
          )}

          {vista === "vender" && cajaEstado === "abierto" && (
          <div className="pos-body">
            {/* Catálogo — mosaico de 2 niveles (tipos → paquetes) */}
            <div className="catalog-pane">
              {catActiva !== null && catActual ? (
                <PackageView
                  categoria={catActual}
                  productos={prodsDeCat}
                  onBack={() => setCatActiva(null)}
                  onProductClick={onClickProducto}
                />
              ) : (
                <TypeMenu
                  categorias={categoriasVisibles}
                  countByCat={countByCat}
                  onPick={setCatActiva}
                />
              )}
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
                    <div className="price">{fmt(precioDeItem(item) * item.cantidad)}</div>
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
          )}

          {vista === "pedidos" && (
            <div className="pos-screen">
              <VistaPedidos sucursalId={sucursalId} />
            </div>
          )}
          {vista === "caja" && (
            <div className="pos-screen">
              <VistaCaja sucursalNombre={sucursalNombre} />
            </div>
          )}
        </div>

        {/* ===== MODALES ===== */}
        {modal?.tipo === "cortes" && (
          <ConfiguradorCortes
            producto={modal.producto}
            gruposCorte={gruposCorte}
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
            precioPapas={productos.find((p) => p.nombre === "Papas Fritas")?.precio ?? 0}
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

        {modal?.tipo === "disponibilidad" && (
          <ConfiguradorDisponibilidad
            cortes={cortesUnicos}
            gruposCorte={gruposCorte}
            overrides={overrides}
            onToggle={(nombre) => void toggleCorteGlobal(nombre)}
            onCerrar={() => setModal(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GateApertura — puerta de entrada a Vender
//
// RN-08 / caja offline (BD-19): una venta sin apertura del día queda huérfana (el servidor
// la rechaza con DIA_NO_ABIERTO y se atasca en la cola). En vez de dejar cobrar y fallar en
// silencio, se exige abrir el turno ANTES de vender. Reusa `abrirDia` del cajaService.
// ---------------------------------------------------------------------------
function GateApertura({
  estado, pendientes, onIrACaja, onAbierto,
}: {
  estado: "cargando" | "sin_abrir" | "cerrado" | "pendiente";
  pendientes: string[];
  onIrACaja: () => void;
  onAbierto: () => void;
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
      // La apertura debe llegar al servidor ANTES que las ventas: la cola la envía primero.
      void sincronizarTodo();
      onAbierto();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el turno.");
    } finally {
      setEnviando(false);
    }
  }

  if (estado === "cargando") {
    return <div className="caja-gate"><div className="muted small">Cargando…</div></div>;
  }

  if (estado === "cerrado") {
    return (
      <div className="caja-gate">
        <div className="gate-card">
          <div className="gate-ico cerrado"><IcoLock size={26} /></div>
          <h1 className="gate-title">Turno cerrado</h1>
          <p className="gate-sub">
            El corte de hoy ya se realizó. No se pueden registrar más ventas hasta la
            siguiente jornada.
          </p>
        </div>
      </div>
    );
  }

  // RN-24: arrastra un turno anterior sin cerrar. No se ofrece capturar el fondo porque
  // `abrirDia` lo va a rechazar de todos modos; se manda a cerrar lo pendiente.
  if (estado === "pendiente") {
    return (
      <div className="caja-gate">
        <div className="gate-card">
          <div className="gate-ico cerrado"><IcoLock size={26} /></div>
          <h1 className="gate-title">
            {pendientes.length === 1 ? "Turno sin cerrar" : "Turnos sin cerrar"}
          </h1>
          <p className="gate-sub">{pendientes.map((f) => fechaOperativaCorta(f)).join(" · ")}</p>
          <button className="btn primary block" style={{ marginTop: 18 }} onClick={onIrACaja}>
            <IcoLock size={17} /> Ir a Caja
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="caja-gate">
      <div className="gate-card">
        <div className="gate-ico"><IcoPower size={26} /></div>
        <h1 className="gate-title">Inicio de turno</h1>
        <p className="gate-sub">Registra el fondo inicial para comenzar a vender.</p>
        <div className="panel" style={{ marginTop: 18, textAlign: "left" }}>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavRail — barra lateral de navegación (Vender / Pedidos / Caja)
// ---------------------------------------------------------------------------
const NAV: { id: Vista; label: string; icon: (p: { size?: number }) => JSX.Element }[] = [
  { id: "vender", label: "Vender", icon: IcoGrid },
  { id: "pedidos", label: "Pedidos", icon: IcoReceipt },
  { id: "caja", label: "Caja", icon: IcoWallet },
];

function NavRail({ vista, onNav }: { vista: Vista; onNav: (v: Vista) => void }) {
  return (
    <nav className="nav-rail">
      {NAV.map((n) => {
        const Icono = n.icon;
        return (
          <button
            key={n.id}
            className={`nav-item ${vista === n.id ? "active" : ""}`}
            onClick={() => onNav(n.id)}
          >
            <span className="nav-ico"><Icono size={22} /></span>
            <span className="nav-lbl">{n.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

