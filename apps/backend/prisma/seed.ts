import { PrismaClient, Unidad, TipoInsumo } from "@prisma/client";
import { aUnidadBase, unidadBaseDe } from "@brasas/shared";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ---------------------------------------------------------------------------
  // Sucursales
  // ---------------------------------------------------------------------------
  const sucursalA = await prisma.sucursal.upsert({
    where: { id: "sucursal-a-000000-0000-0000-0000-000000000001" },
    update: {},
    create: { id: "sucursal-a-000000-0000-0000-0000-000000000001", nombre: "Pradera Dorada" },
  });

  const sucursalB = await prisma.sucursal.upsert({
    where: { id: "sucursal-b-000000-0000-0000-0000-000000000002" },
    update: {},
    create: { id: "sucursal-b-000000-0000-0000-0000-000000000002", nombre: "Villas del Río" },
  });

  console.log("✓ Sucursales");

  // ---------------------------------------------------------------------------
  // Dispositivos (tokens placeholder — se reemplazan en producción)
  // ---------------------------------------------------------------------------
  await prisma.dispositivo.upsert({
    where: { token: "dev-token-sucursal-a" },
    update: {},
    create: {
      id: randomUUID(),
      sucursalId: sucursalA.id,
      nombre: "POS Sucursal A",
      token: "dev-token-sucursal-a",
    },
  });

  await prisma.dispositivo.upsert({
    where: { token: "dev-token-sucursal-b" },
    update: {},
    create: {
      id: randomUUID(),
      sucursalId: sucursalB.id,
      nombre: "POS Sucursal B",
      token: "dev-token-sucursal-b",
    },
  });

  console.log("✓ Dispositivos");

  // ---------------------------------------------------------------------------
  // Insumos
  // ---------------------------------------------------------------------------
  const insumos = await Promise.all([
    // Carnes
    upsertInsumo("Carne Diezmillo", Unidad.KG, TipoInsumo.CARNE, true, null),
    upsertInsumo("Carne Sirloin", Unidad.KG, TipoInsumo.CARNE, true, null),
    upsertInsumo("Carne New York", Unidad.KG, TipoInsumo.CARNE, true, null),
    upsertInsumo("Carne Cabrería", Unidad.KG, TipoInsumo.CARNE, true, null),
    upsertInsumo("Carne Rib Eye", Unidad.KG, TipoInsumo.CARNE, true, null),
    upsertInsumo("Carne de Puerco", Unidad.KG, TipoInsumo.CARNE, true, null),
    // Pollo
    upsertInsumo("Pollo Crudo", Unidad.PIEZA, TipoInsumo.POLLO, true, null),
    upsertInsumo("Pollo Asado", Unidad.PIEZA, TipoInsumo.POLLO, true, null),
    upsertInsumo("Paquete Piezas Crudo", Unidad.PIEZA, TipoInsumo.POLLO, true, null),
    upsertInsumo("Paquete Piezas Asado", Unidad.PIEZA, TipoInsumo.POLLO, true, null),
    // Consumibles
    upsertInsumo("Tortillas", Unidad.KG, TipoInsumo.CONSUMIBLE, true, null),
    upsertInsumo("Frijoles", Unidad.LT, TipoInsumo.CONSUMIBLE, false, null),
    upsertInsumo("Salsa", Unidad.PIEZA, TipoInsumo.CONSUMIBLE, false, null),
    upsertInsumo("Cebolla Asada", Unidad.PIEZA, TipoInsumo.CONSUMIBLE, false, null),
    upsertInsumo("Chiles Toreados", Unidad.PIEZA, TipoInsumo.CONSUMIBLE, false, null),
    upsertInsumo("Lechuga", Unidad.PIEZA, TipoInsumo.CONSUMIBLE, false, null),
    upsertInsumo("Cebolla Curtida", Unidad.PIEZA, TipoInsumo.CONSUMIBLE, false, null),
    upsertInsumo("Sopa Fría", Unidad.LT, TipoInsumo.CONSUMIBLE, false, null),
    // Complementos
    upsertInsumo("Papas a la Francesa", Unidad.GR, TipoInsumo.COMPLEMENTO, false, 1750),
    upsertInsumo("Boneless", Unidad.GR, TipoInsumo.COMPLEMENTO, false, null),
    upsertInsumo("Tenders", Unidad.GR, TipoInsumo.COMPLEMENTO, false, null),
    upsertInsumo("Salchicha", Unidad.PIEZA, TipoInsumo.COMPLEMENTO, false, null),
    upsertInsumo("Guacamole", Unidad.PIEZA, TipoInsumo.COMPLEMENTO, false, null),
    upsertInsumo("Totopos", Unidad.PIEZA, TipoInsumo.COMPLEMENTO, false, null),
    upsertInsumo("Aderezo Ranch", Unidad.PIEZA, TipoInsumo.COMPLEMENTO, false, null),
    upsertInsumo("Aderezo BBQ", Unidad.PIEZA, TipoInsumo.COMPLEMENTO, false, null),
    upsertInsumo("Aderezo Buffalo", Unidad.PIEZA, TipoInsumo.COMPLEMENTO, false, null),
    // Bebidas
    upsertInsumo("Refresco 600ml", Unidad.PIEZA, TipoInsumo.BEBIDA, false, null),
    upsertInsumo("Refresco 1lt", Unidad.PIEZA, TipoInsumo.BEBIDA, false, null),
    upsertInsumo("Refresco 2lt", Unidad.PIEZA, TipoInsumo.BEBIDA, false, null),
    upsertInsumo("Refresco 3lt", Unidad.PIEZA, TipoInsumo.BEBIDA, false, null),
    upsertInsumo("Agua Sabor 1lt", Unidad.PIEZA, TipoInsumo.BEBIDA, false, null),
    upsertInsumo("Té 600ml", Unidad.PIEZA, TipoInsumo.BEBIDA, false, null),
    upsertInsumo("Té 1lt", Unidad.PIEZA, TipoInsumo.BEBIDA, false, null),
  ]);

  const insumoMap = Object.fromEntries(insumos.map((i) => [i.nombre, i]));
  console.log("✓ Insumos");

  // ---------------------------------------------------------------------------
  // Categorías
  // ---------------------------------------------------------------------------
  const catCarneAsada = await upsertCategoria("Carne Asada", 1);
  const catPollos = await upsertCategoria("Pollos", 2);
  const catPiezas = await upsertCategoria("Piezas", 3);
  const catOtros = await upsertCategoria("Otros", 4);
  const catExtras = await upsertCategoria("Extras", 5);
  const catBebidas = await upsertCategoria("Bebidas", 6);

  console.log("✓ Categorías");

  // ---------------------------------------------------------------------------
  // Productos — Carne Asada
  // Los precios son placeholder: el negocio los define antes de producción.
  // ---------------------------------------------------------------------------
  // Precios por paquete y grupo de corte — menú del negocio (julio 2026).
  // `g1` Diezmillo/Sirloin/New York, `g2` Cabrería/Rib Eye, `g3` Puerco.
  const paquetesCarneAsada = [
    { nombre: "Carne Asada Individual", gramosBase: 180, orden: 1, g1: 120, g2: 135, g3: 100 },
    { nombre: "Carne Asada 2 personas", gramosBase: 315, orden: 2, g1: 210, g2: 260, g3: 170 },
    { nombre: "Carne Asada 3 personas", gramosBase: 500, orden: 3, g1: 280, g2: 330, g3: 230 },
    { nombre: "Carne Asada 4 personas", gramosBase: 630, orden: 4, g1: 350, g2: 420, g3: 280 },
    { nombre: "Carne Asada 5 personas", gramosBase: 750, orden: 5, g1: 430, g2: 510, g3: 340 },
    { nombre: "Carne Asada 6 personas", gramosBase: 1000, orden: 6, g1: 520, g2: 600, g3: 400 },
  ];

  // Cantidades de carne CRUDA por paquete (datos del negocio — ajustar antes de producción)
  const carnesCrudasKg: Record<string, number> = {
    "Carne Asada Individual": 0.27,
    "Carne Asada 2 personas": 0.5,
    "Carne Asada 3 personas": 0.75,
    "Carne Asada 4 personas": 0.95,
    "Carne Asada 5 personas": 1.13,
    "Carne Asada 6 personas": 1.5,
  };

  const tortillasPorPaquete: Record<string, number> = {
    "Carne Asada Individual": 0.25,
    "Carne Asada 2 personas": 0.5,
    "Carne Asada 3 personas": 0.5,
    "Carne Asada 4 personas": 0.5,
    "Carne Asada 5 personas": 0.5,
    "Carne Asada 6 personas": 1.0,
  };

  const frijolesPorPaquete: Record<string, number> = {
    "Carne Asada Individual": 0.5,
    "Carne Asada 2 personas": 0.5,
    "Carne Asada 3 personas": 0.5,
    "Carne Asada 4 personas": 0.5,
    "Carne Asada 5 personas": 0.5,
    "Carne Asada 6 personas": 1.0,
  };

  // Grupos de corte (BD-13). Los cortes de un mismo grupo comparten precio y se pueden
  // mezclar entre sí; los de grupos distintos, no (RN-01).
  const grupo1 = await prisma.grupoCorte.upsert({
    where: { id: "grupo-corte-1" },
    update: {},
    create: { id: "grupo-corte-1", nombre: "Grupo 1", orden: 1 },
  });

  const grupo2 = await prisma.grupoCorte.upsert({
    where: { id: "grupo-corte-2" },
    update: {},
    create: { id: "grupo-corte-2", nombre: "Grupo 2", orden: 2 },
  });

  // Cortes Grupo 1: Diezmillo, Sirloin, New York
  const corteG1 = [
    { nombre: "Diezmillo", insumo: "Carne Diezmillo" },
    { nombre: "Sirloin", insumo: "Carne Sirloin" },
    { nombre: "New York", insumo: "Carne New York" },
  ];

  // Cortes Grupo 2: Cabrería, Rib Eye
  const corteG2 = [
    { nombre: "Cabrería", insumo: "Carne Cabrería" },
    { nombre: "Rib Eye", insumo: "Carne Rib Eye" },
  ];

  // Grupo 3: Puerco. El negocio confirmó que NO se mezcla con los cortes de res, así que
  // es un grupo propio y RN-01 (no mezclar grupos distintos) lo impide sin código extra.
  // Consume la misma cantidad de carne cruda por paquete que la res.
  const grupo3 = await prisma.grupoCorte.upsert({
    where: { id: "grupo-corte-3" },
    update: {},
    create: { id: "grupo-corte-3", nombre: "Grupo 3", orden: 3 },
  });

  const corteG3 = [{ nombre: "Puerco", insumo: "Carne de Puerco" }];

  for (const paquete of paquetesCarneAsada) {
    const producto = await prisma.producto.upsert({
      where: { id: `prod-carne-${paquete.orden}-000000-0000-0000-000000000000` },
      // `Producto.precio` guarda el precio del Grupo 1 como referencia; el precio real de
      // un paquete con corte sale siempre de PrecioProductoGrupo.
      update: { precio: paquete.g1, gramosBase: paquete.gramosBase },
      create: {
        id: `prod-carne-${paquete.orden}-000000-0000-0000-000000000000`,
        categoriaId: catCarneAsada.id,
        nombre: paquete.nombre,
        precio: paquete.g1,
        requiereCorte: true,
        gramosBase: paquete.gramosBase,
        orden: paquete.orden,
      },
    });

    // Variantes: cortes de cada grupo. El grupo es una FK, no un entero suelto (BD-13).
    for (const [prefijo, grupo, cortes] of [
      ["g1", grupo1, corteG1],
      ["g2", grupo2, corteG2],
      ["g3", grupo3, corteG3],
    ] as const) {
      for (const corte of cortes) {
        const id = `var-${prefijo}-${paquete.orden}-${corte.nombre.toLowerCase().replace(" ", "-")}`;

        // `insumoId` es lo que permite que el descuento sepa de qué carne descontar cuando
        // el cliente elige un corte (BD-21). Hasta ahora este dato existía en el arreglo de
        // cortes pero no se escribía.
        const insumo = insumoMap[corte.insumo];

        if (!insumo) {
          throw new Error(
            `El corte "${corte.nombre}" apunta al insumo "${corte.insumo}", que no existe.`
          );
        }

        await prisma.productoVariante.upsert({
          where: { id },
          update: { grupoCorteId: grupo.id, insumoId: insumo.id },
          create: {
            id,
            productoId: producto.id,
            nombre: corte.nombre,
            grupoCorteId: grupo.id,
            insumoId: insumo.id,
          },
        });
      }
    }

    // Precio del paquete SEGÚN el grupo de corte (BD-13). Precios reales del negocio: el
    // sobreprecio del Grupo 2 no es plano (escala con la cantidad de carne) y el Grupo 3
    // (puerco) es más barato que ambos. Por eso el precio se modela por (producto, grupo).
    for (const [grupo, precio] of [
      [grupo1, paquete.g1],
      [grupo2, paquete.g2],
      [grupo3, paquete.g3],
    ] as const) {
      await prisma.precioProductoGrupo.upsert({
        where: {
          productoId_grupoCorteId: { productoId: producto.id, grupoCorteId: grupo.id },
        },
        update: { precio },
        create: {
          id: `ppg-${paquete.orden}-${grupo.orden}`,
          productoId: producto.id,
          grupoCorteId: grupo.id,
          precio,
        },
      });
    }

    // Receta
    // Las recetas se escriben en la unidad canónica del insumo: la carne y las tortillas
    // en gramos, los frijoles en mililitros. Las constantes de arriba están en las
    // unidades del negocio (kg, lt) y se convierten aquí, en el borde.
    const carneCruda = aUnidadBase(carnesCrudasKg[paquete.nombre] ?? 0, Unidad.KG);
    const tortillas = aUnidadBase(tortillasPorPaquete[paquete.nombre] ?? 0, Unidad.KG);
    const frijoles = aUnidadBase(frijolesPorPaquete[paquete.nombre] ?? 0, Unidad.LT);


    // Ingrediente de carne. `esVariable = true` significa que el insumo real NO es el que
    // apunta esta fila, sino el de la variante que el cliente eligió
    // (`ProductoVariante.insumoId`, BD-21), repartido según `SeleccionVariante.proporcion`.
    // El insumoId de aquí es solo el marcador de posición de la línea de receta.
    await prisma.ingredienteReceta.upsert({
      where: { id: `ing-carne-${paquete.orden}` },
      update: { cantidad: carneCruda },
      create: {
        id: `ing-carne-${paquete.orden}`,
        productoId: producto.id,
        insumoId: insumoMap["Carne Diezmillo"]!.id, // insumo base; el descuento real usa la variante seleccionada
        cantidad: carneCruda,
        esVariable: true,
      },
    });

    await prisma.ingredienteReceta.upsert({
      where: { id: `ing-tort-${paquete.orden}` },
      update: { cantidad: tortillas },
      create: {
        id: `ing-tort-${paquete.orden}`,
        productoId: producto.id,
        insumoId: insumoMap["Tortillas"]!.id,
        cantidad: tortillas,
        esVariable: false,
      },
    });

    await prisma.ingredienteReceta.upsert({
      where: { id: `ing-frijoles-${paquete.orden}` },
      update: { cantidad: frijoles },
      create: {
        id: `ing-frijoles-${paquete.orden}`,
        productoId: producto.id,
        insumoId: insumoMap["Frijoles"]!.id,
        cantidad: frijoles,
        esVariable: false,
      },
    });
  }

  console.log("✓ Productos y recetas: Carne Asada");

  // ---------------------------------------------------------------------------
  // Productos — Pollos Asados
  // ---------------------------------------------------------------------------
  // El ¼ de pollo se vende como pierna o pechuga. Por ahora el cajero lo anota en las notas
  // del ítem; registrarlo como variante queda pendiente (ver PLAN.md).
  const paquetesPollo = [
    { nombre: "¼ Pollo", fraccion: 0.25, tortillas: 0.25, precio: 80, orden: 1 },
    { nombre: "½ Pollo", fraccion: 0.5, tortillas: 0.5, precio: 115, orden: 2 },
    { nombre: "¾ Pollo", fraccion: 0.75, tortillas: 0.5, precio: 175, orden: 3 },
    { nombre: "Pollo Entero", fraccion: 1.0, tortillas: 0.5, precio: 215, orden: 4 },
  ];

  for (const paquete of paquetesPollo) {
    const producto = await prisma.producto.upsert({
      where: { id: `prod-pollo-${paquete.orden}-00000-0000-0000-000000000000` },
      update: { precio: paquete.precio },
      create: {
        id: `prod-pollo-${paquete.orden}-00000-0000-0000-000000000000`,
        categoriaId: catPollos.id,
        nombre: paquete.nombre,
        precio: paquete.precio,
        orden: paquete.orden,
      },
    });


    await prisma.ingredienteReceta.upsert({
      where: { id: `ing-pollo-asado-${paquete.orden}` },
      update: { cantidad: paquete.fraccion },
      create: {
        id: `ing-pollo-asado-${paquete.orden}`,
        productoId: producto.id,
        insumoId: insumoMap["Pollo Asado"]!.id,
        cantidad: paquete.fraccion,
      },
    });

    // Las tortillas del paquete están en kg; el insumo se almacena en gramos.
    const tortillasPollo = aUnidadBase(paquete.tortillas, Unidad.KG);

    await prisma.ingredienteReceta.upsert({
      where: { id: `ing-tort-pollo-${paquete.orden}` },
      update: { cantidad: tortillasPollo },
      create: {
        id: `ing-tort-pollo-${paquete.orden}`,
        productoId: producto.id,
        insumoId: insumoMap["Tortillas"]!.id,
        cantidad: tortillasPollo,
      },
    });
  }

  console.log("✓ Productos y recetas: Pollos");

  // ---------------------------------------------------------------------------
  // Productos — Piezas (pierna y muslo)
  // ---------------------------------------------------------------------------
  const paquetesPiezas = [
    { nombre: "8 Piezas", fraccion: 1.0, tortillas: 0.5, papas: 350, sopa: 0.5, precio: 260, orden: 1 },
    { nombre: "4 Piezas", fraccion: 0.5, tortillas: 0.5, papas: 175, sopa: 0.25, precio: 130, orden: 2 },
  ];

  for (const paquete of paquetesPiezas) {
    const producto = await prisma.producto.upsert({
      where: { id: `prod-piezas-${paquete.orden}-0000-0000-0000-000000000000` },
      update: { precio: paquete.precio },
      create: {
        id: `prod-piezas-${paquete.orden}-0000-0000-0000-000000000000`,
        categoriaId: catPiezas.id,
        nombre: paquete.nombre,
        precio: paquete.precio,
        orden: paquete.orden,
      },
    });


    // Cada cantidad se convierte desde la unidad en que la piensa el negocio a la unidad
    // canónica del insumo: las piezas se quedan en piezas, las tortillas pasan de kg a
    // gramos, las papas ya están en gramos, y la sopa pasa de litros a mililitros.
    const ingredientes = [
      {
        id: `ing-piezas-${paquete.orden}`,
        insumo: "Paquete Piezas Asado",
        cantidad: aUnidadBase(paquete.fraccion, Unidad.PIEZA),
      },
      {
        id: `ing-tort-piezas-${paquete.orden}`,
        insumo: "Tortillas",
        cantidad: aUnidadBase(paquete.tortillas, Unidad.KG),
      },
      {
        id: `ing-papas-piezas-${paquete.orden}`,
        insumo: "Papas a la Francesa",
        cantidad: aUnidadBase(paquete.papas, Unidad.GR),
      },
      {
        id: `ing-sopa-piezas-${paquete.orden}`,
        insumo: "Sopa Fría",
        cantidad: aUnidadBase(paquete.sopa, Unidad.LT),
      },
    ];

    for (const ing of ingredientes) {
      await prisma.ingredienteReceta.upsert({
        where: { id: ing.id },
        update: { cantidad: ing.cantidad },
        create: {
          id: ing.id,
          productoId: producto.id,
          insumoId: insumoMap[ing.insumo]!.id,
          cantidad: ing.cantidad,
        },
      });
    }
  }

  console.log("✓ Productos y recetas: Piezas");

  // ---------------------------------------------------------------------------
  // Productos — Otros (Tortas, Boneless, Tenders)
  // ---------------------------------------------------------------------------
  const productosOtros = [
    { id: "prod-torta-sencilla-00000-0000-0000-000000000000", nombre: "Torta de Carne Asada", precio: 90, orden: 1 },
    { id: "prod-torta-papas-000-00000-0000-0000-000000000000", nombre: "Torta de Carne Asada con Papas", precio: 110, orden: 2 },
    { id: "prod-boneless-000000-0000-0000-000000000000", nombre: "Boneless", precio: 120, orden: 3 },
    { id: "prod-tenders-0000000-0000-0000-000000000000", nombre: "Tenders", precio: 120, orden: 4 },
    { id: "prod-salchichas-000-0000-0000-000000000000", nombre: "Orden de Salchichas Asadas", precio: 60, orden: 5 },
  ];

  for (const p of productosOtros) {
    await prisma.producto.upsert({
      where: { id: p.id },
      update: { nombre: p.nombre, precio: p.precio, orden: p.orden },
      create: { id: p.id, categoriaId: catOtros.id, nombre: p.nombre, precio: p.precio, orden: p.orden },
    });
  }

  // La orden de salchichas son 6 piezas y nada más: no lleva tortillas ni guarnición.
  // Es la única receta de esta categoría; las de tortas, boneless y tenders son Fase 2.
  await prisma.ingredienteReceta.upsert({
    where: { id: "ing-salchichas-1" },
    update: { cantidad: 6 },
    create: {
      id: "ing-salchichas-1",
      productoId: "prod-salchichas-000-0000-0000-000000000000",
      insumoId: insumoMap["Salchicha"]!.id,
      cantidad: aUnidadBase(6, Unidad.PIEZA),
    },
  });

  console.log("✓ Productos: Otros");

  // ---------------------------------------------------------------------------
  // Productos — Extras
  // ---------------------------------------------------------------------------
  // Nombres tal como los usa el negocio en el menú. El orden del arreglo NO se altera:
  // cada posición fija el id del producto, y renombrar no rompe los pedidos pasados porque
  // ItemPedido guarda el nombre como snapshot.
  //
  // "Extra Papas" pasa a llamarse "Papas Fritas": el negocio confirmó que la orden suelta
  // del menú ($45) y el extra son el mismo producto, así que no se duplica.
  const extras = [
    { nombre: "Frijoles extra", precio: 20 },
    { nombre: "Tortillas extra", precio: 15 },
    { nombre: "Cebolla extra", precio: 15 },
    { nombre: "Verdura extra", precio: 20 },
    { nombre: "Salsa extra", precio: 15 },
    { nombre: "Chile extra", precio: 15 },
    { nombre: "Papas Fritas", precio: 45 },
    { nombre: "Guacamole", precio: 70 },
    { nombre: "Totopos", precio: 20 },
    { nombre: "Sopa Fría", precio: 35 },
  ];

  for (let i = 0; i < extras.length; i++) {
    const extra = extras[i]!;
    await prisma.producto.upsert({
      where: { id: `prod-extra-${i + 1}-0000-0000-0000-000000000000` },
      update: { nombre: extra.nombre, precio: extra.precio },
      create: {
        id: `prod-extra-${i + 1}-0000-0000-0000-000000000000`,
        categoriaId: catExtras.id,
        nombre: extra.nombre,
        precio: extra.precio,
        orden: i + 1,
      },
    });
  }

  console.log("✓ Productos: Extras");

  // ---------------------------------------------------------------------------
  // Productos — Bebidas
  // ---------------------------------------------------------------------------
  const bebidas = [
    { nombre: "Agua Sabor 1lt", precio: 25 },
    { nombre: "Refresco 600ml", precio: 25 },
    { nombre: "Refresco 1lt", precio: 30 },
    { nombre: "Refresco 2lt", precio: 40 },
    { nombre: "Refresco 3lt", precio: 60 },
    { nombre: "Té 600ml", precio: 20 },
    { nombre: "Té 1lt", precio: 30 },
  ];

  for (let i = 0; i < bebidas.length; i++) {
    const bebida = bebidas[i]!;
    await prisma.producto.upsert({
      where: { id: `prod-bebida-${i + 1}-000-0000-0000-000000000000` },
      update: { precio: bebida.precio },
      create: {
        id: `prod-bebida-${i + 1}-000-0000-0000-000000000000`,
        categoriaId: catBebidas.id,
        nombre: bebida.nombre,
        precio: bebida.precio,
        orden: i + 1,
      },
    });
  }

  console.log("✓ Productos: Bebidas");

  // ---------------------------------------------------------------------------
  // Transformaciones permitidas (BD-11)
  // ---------------------------------------------------------------------------
  // La regla "solo pollo crudo → asado, y solo en Sucursal B" vivía en prosa y en la
  // lógica del código. Ahora vive en la base: se puede cambiar sin desplegar, y nada
  // impide que el sistema rechace una transformación absurda.
  //
  // Sucursal B (Villas del Río) tiene el único asadero de pollos. Ambas conversiones son
  // 1:1 — un pollo crudo produce un pollo asado.
  const transformaciones = [
    { origen: "Pollo Crudo", destino: "Pollo Asado" },
    { origen: "Paquete Piezas Crudo", destino: "Paquete Piezas Asado" },
  ];

  for (const t of transformaciones) {
    const id = `transf-${t.origen.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 24)}`;

    await prisma.transformacionPermitida.upsert({
      where: { id },
      update: { activo: true },
      create: {
        id,
        insumoOrigenId: insumoMap[t.origen]!.id,
        insumoDestinoId: insumoMap[t.destino]!.id,
        sucursalId: sucursalB.id, // solo el asadero
        factor: 1,
      },
    });
  }

  console.log("✓ Transformaciones permitidas (solo Sucursal B)");

  // ---------------------------------------------------------------------------
  // Versión del catálogo (BD-04)
  // ---------------------------------------------------------------------------
  // El seed acaba de cambiar precios, nombres y productos. Si la versión no sube, las
  // terminales creen que su copia está al día y siguen vendiendo con los precios viejos
  // sin que nada lo marque. Va al final: para entonces el catálogo ya está completo.
  const catalogo = await prisma.catalogoVersion.upsert({
    where: { id: 1 },
    update: { version: { increment: 1 } },
    create: { id: 1, version: 1 },
  });

  console.log(`✓ CatalogoVersion → ${catalogo.version}`);
  console.log("\nSeed completado.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// El seed es un BORDE del sistema: aquí los datos se escriben como los piensa el negocio
// (la carne en kilos, los frijoles en litros) y se convierten a la unidad canónica de
// almacenamiento. Dentro del sistema, todo son gramos, mililitros y piezas. Ver BD-10.
async function upsertInsumo(
  nombre: string,
  unidadDisplay: Unidad,
  tipo: TipoInsumo,
  esDiario: boolean,
  // En la unidad de DISPLAY: una bolsa de papas rinde 1750 gr; una de carne, 5 kg.
  rendimientoBolsaDisplay: number | null
) {
  const id = `insumo-${nombre.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30)}`;

  const rendimientoBolsa =
    rendimientoBolsaDisplay === null
      ? null
      : aUnidadBase(rendimientoBolsaDisplay, unidadDisplay);

  return prisma.insumo.upsert({
    where: { id },
    update: { unidadDisplay, unidadBase: unidadBaseDe(unidadDisplay), rendimientoBolsa },
    create: {
      id,
      nombre,
      unidadDisplay,
      unidadBase: unidadBaseDe(unidadDisplay),
      tipo,
      esDiario,
      rendimientoBolsa,
    },
  });
}

async function upsertCategoria(nombre: string, orden: number) {
  const id = `cat-${nombre.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  return prisma.categoria.upsert({
    where: { id },
    update: {},
    create: { id, nombre, orden },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
