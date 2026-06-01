import { Router, type IRouter } from "express";
import { healthCheck } from "../controllers/health.js";
import { getCatalogo } from "../controllers/catalogo.js";
import { postPedido } from "../controllers/pedido.js";
import { postDevImprimir } from "../controllers/devImprimir.js";
import { authDevice } from "../middleware/auth.js";

const router: IRouter = Router();

router.get("/health", healthCheck);
router.get("/catalog", authDevice, getCatalogo);
router.post("/pedidos", authDevice, postPedido);
router.post("/dev/imprimir", authDevice, postDevImprimir);

export default router;
