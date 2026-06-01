# PLAN.md — Las Brasas POS
## Roadmap de ejecución

> Este documento define el orden de construcción del sistema. Acompaña a `CONTEXT.md` (qué es el sistema), `SRS.md` (requerimientos) y `ER.md` (modelo de datos). El plan se ordena por **dependencias y riesgo técnico**, no por estimaciones de tiempo. Cada hito tiene criterios de "hecho" que deben cumplirse antes de avanzar.

---

## Cómo leer este plan

- **Fase**: gran iteración de trabajo. Las 4 fases son secuenciales.
- **Hito (M)**: bloque entregable dentro de una fase. Los hitos dentro de una fase pueden tener dependencias entre sí (se indican).
- **Tarea**: unidad de trabajo concreta. Es el nivel que se delega a Claude Code.
- **Criterio de hecho**: condición verificable para considerar el hito terminado.
- **Punto de validación**: momento donde hay que parar y probar con hardware real o confirmar algo con el dueño.

Principio rector del orden: **los riesgos técnicos más altos se atacan temprano**. La lógica de impresión (generación de contenido) y el corte de caja se construyen y prueban temprano. La validación de impresión en hardware físico se realiza en cuanto la terminal esté disponible; gracias al desacople por interfaz, no bloquea el avance del resto de la Fase 1.

---

## FASE 0 — Cimientos del proyecto

> Trabajo preparatorio común a todo el sistema. No entrega funcionalidad de negocio pero desbloquea todo lo demás.

### M0.1 — Configuración del repositorio y entorno
- Inicializar monorepo o repos separados (backend, POS, app dueño). Decisión: monorepo recomendado para un solo desarrollador.
- Configurar TypeScript estricto en todos los paquetes.
- Configurar linter y formateador.
- Crear el archivo `CLAUDE.md` con las reglas operativas para Claude Code.
- Configurar variables de entorno fuera del código (`.env`, nunca commiteadas).

**Criterio de hecho**: el repo está inicializado, compila en TypeScript estricto, y `CLAUDE.md` existe.

### M0.2 — Base de datos y modelo
- Crear el proyecto en Supabase.
- Trasladar el schema de Prisma de `CONTEXT.md` sección 4 a `schema.prisma`.
- Generar la primera migración.
- Escribir el script de seed con los datos de referencia de `CONTEXT.md` sección 5 (insumos, categorías, productos, recetas, las dos sucursales, dispositivos).

**Criterio de hecho**: la migración corre sin error, el seed puebla la base, y Prisma Client se genera con los tipos correctos.

### M0.3 — Esqueleto del backend
- Servidor Express + TypeScript con estructura de carpetas definida (rutas, controladores, servicios, middleware).
- Middleware de autenticación de terminal por token (`X-Device-Token`) y de usuario (JWT).
- Middleware de manejo de errores estructurado (`{ code, message, details }`).
- Endpoint de health check.
- Deploy inicial en Railway o Render conectado a Supabase.

**Criterio de hecho**: el backend levanta, responde el health check en producción, y los middlewares de auth resuelven sucursal/usuario correctamente.

### M0.4 — Esqueleto del frontend POS
- App React + TypeScript (PWA) con estructura de carpetas.
- Configuración de IndexedDB con la capa de acceso a datos local.
- Pantalla de carga inicial que sincroniza el catálogo desde el backend.
- Cáscara Android (WebView) con el proyecto Kotlin base, sin la lógica de impresión todavía.

**Criterio de hecho**: la PWA carga, lee y escribe en IndexedDB, y corre dentro de la WebView en una terminal Android.

---

## FASE 1 — Núcleo del POS y operación básica

> Objetivo: un POS funcional que reemplace al sistema actual. Al final de esta fase, el negocio puede vender, cobrar, imprimir y hacer su corte de caja, con capacidad offline.

**Dependencia**: requiere toda la Fase 0.

### M1.1 — Sistema de impresión *(prioridad de riesgo #1)*

La impresión se divide en dos partes desacopladas. Esto permite avanzar sin tener la terminal física disponible.

**Parte A — Generación de contenido del ticket (no requiere hardware)**
- Definir una interfaz abstracta `ImpresoraService` con el método `imprimir(ticket)`.
- Generar el formato del ticket de cliente (con precios, folio, sucursal).
- Generar el formato de la comanda de producción (sin precios, formato grande).
- Implementación de desarrollo de `ImpresoraService` que renderiza el ticket como PDF/imagen con el ancho de un ticket térmico (58mm u 80mm), para validación visual.
- Tests automatizados: dado un pedido, verificar que el contenido generado es el esperado.

**Parte B — Envío al dispositivo físico (requiere hardware)**
- Implementar el puente JS ↔ Kotlin en la WebView.
- Implementación real de `ImpresoraService` con el SDK de la terminal (Sunmi o equivalente).
- Manejo de errores de impresión: sin papel, impresora no disponible, reintentos.

**Punto de validación (Parte A, sin hardware)**: revisar visualmente los tickets generados como PDF/imagen; validar el formato con el dueño.

**Punto de validación (Parte B, con hardware)**: cuando la terminal esté disponible, probar la impresión física real, incluyendo los casos de error. La Parte B se realiza en cuanto se tenga el hardware; no bloquea el avance de los demás hitos de la Fase 1, ya que el resto del sistema depende solo de la interfaz `ImpresoraService`, no del dispositivo.

**Criterio de hecho (Parte A)**: ambos tickets se generan correctamente, los tests pasan, y el formato se ve bien en la salida PDF/imagen.
**Criterio de hecho (Parte B)**: ambos tickets se imprimen en hardware real; los errores de impresora se detectan y se muestran al usuario.

### M1.2 — Catálogo y armado de pedido
- Endpoint y lógica para servir el catálogo (categorías, productos, variantes).
- Pantalla del POS con productos por categoría, respetando el campo `orden`.
- Configurador de paquete de carne: selector de cortes filtrado por grupo de precio, validación de mezcla (RN-01), validación de proporciones suma 1.000 (RN-02).
- Armado de pedido multi-producto con cálculo de total.
- Marcado de cortes no disponibles.

**Criterio de hecho**: se puede armar un pedido completo con paquetes de carne (incluyendo mezcla de cortes), pollos, bebidas y extras; las reglas de mezcla se enforzan.

### M1.3 — Cobro, folios y pedido
- Lógica de asignación de folio: contador diario por sucursal, atómico, con reinicio diario (RF-PV-05, RF-PV-06).
- Registro de método de pago y cierre de la venta.
- Persistencia del pedido con sus items y selecciones de variante.
- Conservación del precio histórico en `ItemPedido.precioUnitario`.
- Disparo de la impresión de tickets al cobrar.

**Dependencia**: M1.1 Parte A (interfaz y generación de tickets), M1.2 (armado de pedido).

**Criterio de hecho**: un pedido se cobra, se le asigna folio consecutivo correcto, se persiste, y se imprimen los dos tickets.

### M1.4 — Capacidad offline del flujo de venta *(prioridad de riesgo #4)*
- Persistencia de pedidos en IndexedDB cuando no hay conexión.
- Contador de folio local en la terminal (RF-PV-14).
- Cola de operaciones pendientes de sincronizar.
- Capa de sincronización en el backend: endpoint que recibe lotes de operaciones offline, las valida y responde el estado actualizado.
- Lógica de sincronización en el POS: detección de reconexión, envío de la cola, manejo de la respuesta.
- Idempotencia garantizada por los UUID generados en cliente.

**Punto de validación**: probar el ciclo completo de venta con el internet desconectado y luego reconectar, verificando que nada se duplique ni se pierda.

**Criterio de hecho**: una venta completa (armado, cobro, impresión, folio) funciona sin internet; al reconectar, el pedido aparece en la nube exactamente una vez.

### M1.5 — Gestión de pedidos y estados
- Estados de pedido: `PENDIENTE`, `LISTO`, `ENTREGADO`, `CANCELADO` (RF-PE-01).
- Vista de pedidos activos organizados por estado (RF-PE-02).
- Actualización en tiempo real de la vista (RF-PE-06) vía Supabase Realtime cuando hay conexión.
- Transiciones de estado válidas.

**Criterio de hecho**: los pedidos transitan por sus estados, la vista los organiza correctamente y se actualiza en vivo.

### M1.6 — Cancelaciones y reembolsos
- Cancelación de pedido no cobrado: pasa a `CANCELADO` (RF-PV-10).
- Cancelación de pedido cobrado: pasa a `CANCELADO`, registra reembolso con monto y fecha (RF-PV-11).
- Reversión de inventario si lo hubiera (en Fase 1 aún no hay inventario; preparar el punto de extensión).

**Criterio de hecho**: ambos tipos de cancelación funcionan; el reembolso queda registrado en el pedido.

### M1.7 — Clientes básico
- Registro de clientes (teléfono único, nombre opcional) (RF-CL-01).
- Direcciones múltiples por cliente, una principal (RF-CL-02).
- Asociación opcional de cliente a pedido.

**Criterio de hecho**: se puede registrar un cliente con direcciones y asociarlo a un pedido.

### M1.8 — Corte de caja y conciliación *(prioridad de riesgo #2)*
- Registro del fondo de caja inicial (versión mínima de apertura para Fase 1).
- Cierre del día: cálculo de ventas por método de pago (RF-AD-03).
- Conciliación automática: diferencia entre conteo físico y esperado, considerando reembolsos en efectivo (RF-AD-04).
- Registro de gastos del día con foto opcional (RF-AD-05).
- Generación y envío del reporte de cierre al dueño (RF-AD-07).
- Restricción de una apertura y un cierre por sucursal por fecha (RN-08).

**Punto de validación**: validar con el dueño que los cálculos del corte de caja coinciden con cómo lo hace hoy en la libreta.

**Criterio de hecho**: el corte de caja calcula correctamente, la conciliación detecta diferencias, y el reporte llega al dueño.

### Cierre de Fase 1
**El sistema reemplaza al POS actual.** Antes de pasar a Fase 2: operar la Fase 1 en una sucursal real durante varios días, corregir lo que la operación real revele, y confirmar adopción del personal.

---

## FASE 2 — Inventario y coordinación entre sucursales

> Objetivo: reemplazar la libreta y resolver la coordinación de pollos. Al final, el sistema descuenta inventario automáticamente y coordina las sucursales.

**Dependencia**: Fase 1 operando en producción de forma estable.

### M2.1 — Inventario de insumos
- Inventario de insumos por sucursal (`InventarioInsumo`) (RF-IN-01).
- Registro de entradas de inventario, con conversión de bolsas a unidad para papas/boneless/tenders (RF-IN-10, RF-IN-11).
- Distinción de insumos diarios vs persistentes (RF-IN-07).
- Alertas de stock bajo por umbral (RF-IN-09).

**Criterio de hecho**: cada sucursal tiene su inventario; las entradas lo incrementan; las alertas se disparan al cruzar el umbral.

### M2.2 — Recetas y descuento automático
- Lógica de recetas: cada producto descuenta sus insumos al venderse (RF-IN-04).
- Descuento en transacción atómica (RN-11); si un insumo es insuficiente, falla por completo (RF-IN-02).
- Descuento de carne cruda con cantidad fija por paquete, repartida por proporción en mezclas (RF-IN-03, RN-09).
- Reversión de inventario al cancelar un pedido (completar el punto de extensión de M1.6).

**Dependencia**: M2.1.

**Punto de validación**: verificar con datos reales que el descuento de carne y de insumos coincide con el consumo real del negocio.

**Criterio de hecho**: vender un pedido descuenta correctamente todos los insumos; cancelarlo los revierte; la transacción es atómica.

### M2.3 — Inventario y transformación de pollos
- Insumos de pollo en sus cuatro formas: crudo, asado, paquete de piezas crudo, paquete de piezas asado (RF-IN-05).
- Registro de transformaciones (Pollo Crudo → Asado y Piezas Crudo → Asado), solo en Sucursal B (RF-IN-06, RN-06), con número de tanda.

**Criterio de hecho**: las transformaciones descuentan del insumo origen e incrementan el destino; quedan registradas con tanda.

### M2.4 — Coordinación entre sucursales
- Inventario de pollos de la otra sucursal visible en tiempo real (RF-CS-01).
- Registro de traslado: descuenta origen al registrar (RF-CS-02, RN-07).
- Confirmación de recepción: incrementa destino al confirmar (RF-CS-03).
- Cancelación de traslado pendiente, revierte el descuento (RF-CS-04).
- Notificación visual de traslado pendiente (RF-CS-05).
- Historial de traslados del día (RF-CS-06).

**Dependencia**: M2.3.

**Nota de arquitectura**: esta funcionalidad requiere internet y se degrada sin conexión (ver `CONTEXT.md` sección 2.1.1).

**Criterio de hecho**: un traslado se registra, notifica, confirma y refleja en ambos inventarios; el historial queda disponible.

### M2.5 — Apertura del día y registro diario
- Apertura del día: fondo de caja + estado inicial de insumos diarios (tortillas, pollos, carne) (RF-AD-01).
- Precarga de la carne sobrante del cierre anterior (`BolsaSobrante`).
- Registro de carne sobrante por bolsa al cierre (RF-IN-08).
- Comparativa de inventario al cierre: físico vs calculado (RF-AD-06).
- Cálculo automático de consumo de tortillas (RF-AD-10).
- Visualización de insumos diarios en tiempo real (RF-IN-12).

**Dependencia**: M2.1, M2.2.

**Criterio de hecho**: la apertura registra el estado inicial; el cierre registra sobrantes y muestra la comparativa; el consumo de tortillas se calcula solo.

### M2.6 — Comidas de empleados
- Registro de comidas del personal antes del cierre (RF-AD-09).
- Descuento de inventario por receta, sin afectar caja (RN-12).

**Dependencia**: M2.2.

**Criterio de hecho**: las comidas descuentan insumos y aparecen separadas de las ventas en el cierre.

### Cierre de Fase 2
**La libreta queda reemplazada.** Operar en producción y validar que el inventario calculado cuadra con la realidad física durante varios días.

---

## FASE 3 — Pedidos remotos y gestión del dueño

> Objetivo: eliminar el cuello de botella del teléfono y dar visibilidad remota al dueño.

**Dependencia**: Fase 2 operando de forma estable.

### M3.1 — Autenticación del dueño
- Login del dueño con email y contraseña, sesión con JWT y refresh tokens (RF-SE-02).

**Criterio de hecho**: el dueño accede de forma segura; la sesión expira y se renueva.

### M3.2 — App del dueño y dashboard
- App React Native (Android).
- Dashboard en vivo: ventas del día por sucursal, productos más vendidos, inventario, movimientos de dinero, pedidos activos (RF-GD-01).
- Actualización en tiempo real.
- Comparativa contra el mismo día de la semana anterior (RF-GD-02).

**Dependencia**: M3.1.

**Criterio de hecho**: el dueño ve el estado de ambas sucursales en vivo desde su celular.

### M3.3 — Gestión de catálogo y precios
- Pantalla en la app del dueño para altas, bajas, edición de precios, orden y disponibilidad de productos (RF-GD-05).
- Propagación de cambios a las terminales POS.

**Criterio de hecho**: el dueño modifica el catálogo y los cambios llegan a las terminales; los pedidos históricos conservan su precio.

### M3.4 — Captura de pedidos telefónicos y pedidos programados
- Captura de pedido telefónico en la terminal, origen `TELEFONO` (RF-RM-03).
- Identificación automática de cliente por teléfono (RF-CL-03).
- Historial de pedidos por cliente (RF-CL-04).
- Pedidos programados con hora de recolección (RF-PE-04).
- Timing inverso: cálculo de la hora de inicio de preparación (RF-PE-05).
- Vistas extendidas de pedidos: Próximos, En preparación, Listos, En ruta (RF-PE-03).

**Criterio de hecho**: se captura un pedido telefónico, se programa, y el sistema calcula cuándo iniciarlo; las cuatro vistas funcionan.

### M3.5 — Proveedores y compras
- Catálogo de proveedores y registro de compras con producto, cantidad, precio y fecha (RF-AD-08).
- Histórico de precios y gastos por proveedor.

**Criterio de hecho**: se registran compras y se consulta el histórico por proveedor.

### Cierre de Fase 3
Operar y validar que la captura remota y el dashboard cubren las necesidades del dueño.

---

## FASE 4 — Automatización y canales digitales

> Objetivo: escalar a canales digitales y automatizar la comunicación.

**Dependencia**: Fase 3 operando de forma estable.

### M4.1 — Bot de WhatsApp
- Integración con WhatsApp Cloud API (Meta), webhook en el backend.
- Flujo guiado del bot: armado de pedido por menú, elección de sucursal y hora (RF-RM-01).
- Menú digital interactivo navegable por link (RF-RM-04).
- Asignación del pedido a la sucursal elegida, origen `WHATSAPP` (RF-RM-02).

**Criterio de hecho**: un cliente arma un pedido completo por WhatsApp y este llega estructurado a la sucursal correcta.

### M4.2 — Reportes automáticos por WhatsApp
- Resumen diario al cierre y resumen semanal con tendencias al dueño (RF-GD-03).
- Reportes configurables (RF-GD-04).

**Criterio de hecho**: el dueño recibe los reportes automáticamente sin solicitarlos.

### M4.3 — Integración con plataformas de delivery
- Preparar el flujo unificado para recibir pedidos de Rappi, UberEats, Didi Food, origen `DELIVERY` (RF-RM-05).

**Criterio de hecho**: el sistema está listo para recibir pedidos de delivery en el flujo unificado cuando el negocio active las plataformas.

### Cierre de Fase 4
Sistema completo en operación.

---

## Resumen de hitos

| Fase | Hitos | Foco |
|---|---|---|
| **Fase 0** | M0.1 – M0.4 | Cimientos: repo, base de datos, esqueletos |
| **Fase 1** | M1.1 – M1.8 | POS funcional con offline, impresión, caja |
| **Fase 2** | M2.1 – M2.6 | Inventario, recetas, coordinación de pollos |
| **Fase 3** | M3.1 – M3.5 | Pedidos remotos, dashboard del dueño |
| **Fase 4** | M4.1 – M4.3 | Bot de WhatsApp, reportes, delivery |

---

## Puntos de validación críticos (resumen)

Momentos donde hay que parar y validar antes de seguir:

1. **M1.1 Parte A** — Revisar visualmente los tickets generados (PDF/imagen) y validar el formato con el dueño.
2. **M1.1 Parte B** — Probar impresión en hardware real cuando la terminal esté disponible, incluyendo errores.
3. **M1.4** — Probar el ciclo de venta offline y reconexión sin duplicados.
4. **M1.8** — Validar con el dueño que el corte de caja coincide con su método actual.
5. **Cierre Fase 1** — Operar en sucursal real varios días antes de Fase 2.
6. **M2.2** — Verificar que el descuento de inventario coincide con el consumo real.
7. **Cierre Fase 2** — Validar que el inventario calculado cuadra con la realidad física.

---

*Documento generado a partir de la sesión de planeación de Las Brasas POS. El orden refleja dependencias técnicas y prioridades de riesgo, no estimaciones de tiempo. Las fechas las define el desarrollador según su disponibilidad.*
