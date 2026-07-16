import { Router, type IRouter } from "express";
import { healthCheck } from "../controllers/health.js";
import { getCatalogo } from "../controllers/catalogo.js";
import { postPedido } from "../controllers/pedido.js";
import { postSyncPedidos } from "../controllers/sync.js";
import { getFolioMaximo } from "../controllers/folio.js";
import { getPedidosActivos } from "../controllers/pedidosActivos.js";
import { patchPedidoEstado } from "../controllers/pedidoEstado.js";
import { postDevImprimir, postDevImprimirCierre } from "../controllers/devImprimir.js";
import { getCliente, postCliente, postDireccion, patchDireccion } from "../controllers/cliente.js";
import {
  getEstadoCaja,
  getVentasDia,
  postApertura,
  postMovimiento,
  deleteMovimiento,
  postCierre,
} from "../controllers/caja.js";
import { authDevice } from "../middleware/auth.js";
import { requireAppVersion } from "../middleware/appVersion.js";

const router: IRouter = Router();

// Toda ruta que hable con una terminal pasa por el handshake de versión: una app
// desactualizada recibe 426 CLIENTE_DESACTUALIZADO en lugar de errores crípticos de
// validación. /health queda fuera a propósito: es el sondeo de disponibilidad y debe
// responder aunque la terminal esté vieja.
const terminal = [authDevice, requireAppVersion];

router.get("/health", healthCheck);
router.get("/catalog", terminal, getCatalogo);
router.post("/pedidos", terminal, postPedido);
router.post("/sync/pedidos", terminal, postSyncPedidos);
router.get("/pedidos/folio-maximo", terminal, getFolioMaximo);
router.get("/pedidos/activos", terminal, getPedidosActivos);
router.patch("/pedidos/:id/estado", terminal, patchPedidoEstado);
router.post("/dev/imprimir", terminal, postDevImprimir);
router.post("/dev/imprimir-cierre", terminal, postDevImprimirCierre);
router.get("/clientes", terminal, getCliente);
router.post("/clientes", terminal, postCliente);
router.post("/clientes/:id/direcciones", terminal, postDireccion);
router.patch("/clientes/:id/direcciones/:dirId", terminal, patchDireccion);
router.get("/caja/estado", terminal, getEstadoCaja);
router.get("/caja/ventas", terminal, getVentasDia);
router.post("/caja/apertura", terminal, postApertura);
router.post("/caja/movimientos", terminal, postMovimiento);
router.delete("/caja/movimientos/:id", terminal, deleteMovimiento);
router.post("/caja/cierre", terminal, postCierre);

export default router;
