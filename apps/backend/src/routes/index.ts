import { Router, type IRouter } from "express";
import { healthCheck } from "../controllers/health.js";
import { getCatalogo } from "../controllers/catalogo.js";
import { postPedido } from "../controllers/pedido.js";
import { postSyncPedidos } from "../controllers/sync.js";
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

const router: IRouter = Router();

router.get("/health", healthCheck);
router.get("/catalog", authDevice, getCatalogo);
router.post("/pedidos", authDevice, postPedido);
router.post("/sync/pedidos", authDevice, postSyncPedidos);
router.get("/pedidos/activos", authDevice, getPedidosActivos);
router.patch("/pedidos/:id/estado", authDevice, patchPedidoEstado);
router.post("/dev/imprimir", authDevice, postDevImprimir);
router.post("/dev/imprimir-cierre", authDevice, postDevImprimirCierre);
router.get("/clientes", authDevice, getCliente);
router.post("/clientes", authDevice, postCliente);
router.post("/clientes/:id/direcciones", authDevice, postDireccion);
router.patch("/clientes/:id/direcciones/:dirId", authDevice, patchDireccion);
router.get("/caja/estado", authDevice, getEstadoCaja);
router.get("/caja/ventas", authDevice, getVentasDia);
router.post("/caja/apertura", authDevice, postApertura);
router.post("/caja/movimientos", authDevice, postMovimiento);
router.delete("/caja/movimientos/:id", authDevice, deleteMovimiento);
router.post("/caja/cierre", authDevice, postCierre);

export default router;
