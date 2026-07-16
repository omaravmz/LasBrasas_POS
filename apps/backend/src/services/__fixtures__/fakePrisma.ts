// Fake de Prisma en memoria para probar services/inventario.ts sin una base de datos.
//
// El resto de la suite del backend es libre de BD (funciones puras). El servicio de
// inventario, en cambio, habla con Prisma —recibe un TransactionClient y también usa el
// singleton `prisma` para auditar—. Este fake reimplementa EXACTAMENTE las consultas que
// el servicio hace (y solo esas), para poder verificar su lógica crítica —todo-o-nada,
// idempotencia, neteo de deltas, reversión como opuesto exacto— sin levantar Postgres.
//
// No pretende ser un Prisma completo: si el servicio cambiara sus consultas, este fake
// debe seguirlas. Es deliberadamente estrecho.

import { Prisma } from "@prisma/client";
import type {
  TipoMovimientoInventario,
  TipoReferencia,
  UnidadBase,
} from "@prisma/client";

const Decimal = Prisma.Decimal;

export interface MovRow {
  id: string;
  sucursalId: string;
  insumoId: string;
  cantidad: Prisma.Decimal;
  tipo: TipoMovimientoInventario;
  refTipo: TipoReferencia;
  refId: string;
  fechaOperativa: Date;
  notas: string | null;
}

export interface SaldoRow {
  id: string;
  sucursalId: string;
  insumoId: string;
  cantidad: Prisma.Decimal;
  ultimoMovimiento: Date;
}

export interface InsumoRow {
  id: string;
  nombre: string;
  unidadBase: UnidadBase;
}

export interface PermitidaRow {
  insumoOrigenId: string;
  insumoDestinoId: string;
  sucursalId: string | null;
  factor: Prisma.Decimal;
  activo: boolean;
}

// --- Formas de `where` que el servicio realmente usa ---

type MovWhere =
  | {
      OR: {
        refTipo: TipoReferencia;
        refId: string;
        sucursalId: string;
        insumoId: string;
        tipo: TipoMovimientoInventario;
      }[];
    }
  | { refTipo: TipoReferencia; refId: string; tipo: { notIn: TipoMovimientoInventario[] } };

interface MovCreate {
  sucursalId: string;
  insumoId: string;
  cantidad: Prisma.Decimal;
  tipo: TipoMovimientoInventario;
  refTipo: TipoReferencia;
  refId: string;
  fechaOperativa: Date;
  notas: string | null;
}

interface SaldoKey {
  sucursalId_insumoId: { sucursalId: string; insumoId: string };
}

class FakePrisma {
  movimientosStore: MovRow[] = [];
  saldosStore: SaldoRow[] = [];
  insumosStore: InsumoRow[] = [];
  permitidasStore: PermitidaRow[] = [];

  reset(): void {
    this.movimientosStore = [];
    this.saldosStore = [];
    this.insumosStore = [];
    this.permitidasStore = [];
  }

  // --- Sembrado para los tests ---

  seedInsumo(row: InsumoRow): void {
    this.insumosStore.push(row);
  }

  seedSaldo(sucursalId: string, insumoId: string, cantidad: number): void {
    this.saldosStore.push({
      id: crypto.randomUUID(),
      sucursalId,
      insumoId,
      cantidad: new Decimal(cantidad),
      ultimoMovimiento: new Date(),
    });
  }

  seedMovimiento(row: Omit<MovRow, "id">): void {
    this.movimientosStore.push({ id: crypto.randomUUID(), ...row });
  }

  seedPermitida(row: PermitidaRow): void {
    this.permitidasStore.push(row);
  }

  saldoDe(sucursalId: string, insumoId: string): Prisma.Decimal | null {
    return (
      this.saldosStore.find((s) => s.sucursalId === sucursalId && s.insumoId === insumoId)
        ?.cantidad ?? null
    );
  }

  // --- Delegados que imitan a Prisma ---

  movimientoInventario = {
    findMany: async (args: { where: MovWhere }): Promise<MovRow[]> => {
      const w = args.where;
      if ("OR" in w) {
        return this.movimientosStore.filter((m) =>
          w.OR.some(
            (c) =>
              m.refTipo === c.refTipo &&
              m.refId === c.refId &&
              m.sucursalId === c.sucursalId &&
              m.insumoId === c.insumoId &&
              m.tipo === c.tipo,
          ),
        );
      }
      return this.movimientosStore.filter(
        (m) => m.refTipo === w.refTipo && m.refId === w.refId && !w.tipo.notIn.includes(m.tipo),
      );
    },

    createMany: async (args: { data: MovCreate[] }): Promise<{ count: number }> => {
      for (const d of args.data) {
        this.movimientosStore.push({ id: crypto.randomUUID(), ...d });
      }
      return { count: args.data.length };
    },

    aggregate: async (args: {
      where: { sucursalId: string; insumoId: string };
      _sum: { cantidad: true };
    }): Promise<{ _sum: { cantidad: Prisma.Decimal | null } }> => {
      const rows = this.movimientosStore.filter(
        (m) => m.sucursalId === args.where.sucursalId && m.insumoId === args.where.insumoId,
      );
      if (rows.length === 0) return { _sum: { cantidad: null } };
      const suma = rows.reduce((s, m) => s.plus(m.cantidad), new Decimal(0));
      return { _sum: { cantidad: suma } };
    },
  };

  inventarioInsumo = {
    findUnique: async (args: { where: SaldoKey }): Promise<SaldoRow | null> => {
      const { sucursalId, insumoId } = args.where.sucursalId_insumoId;
      return (
        this.saldosStore.find((s) => s.sucursalId === sucursalId && s.insumoId === insumoId) ??
        null
      );
    },

    upsert: async (args: {
      where: SaldoKey;
      create: { sucursalId: string; insumoId: string; cantidad: Prisma.Decimal; ultimoMovimiento: Date };
      update: { cantidad: { increment: Prisma.Decimal }; ultimoMovimiento: Date };
    }): Promise<SaldoRow> => {
      const { sucursalId, insumoId } = args.where.sucursalId_insumoId;
      const existente = this.saldosStore.find(
        (s) => s.sucursalId === sucursalId && s.insumoId === insumoId,
      );
      if (existente) {
        existente.cantidad = existente.cantidad.plus(args.update.cantidad.increment);
        existente.ultimoMovimiento = args.update.ultimoMovimiento;
        return existente;
      }
      const fila: SaldoRow = {
        id: crypto.randomUUID(),
        sucursalId,
        insumoId,
        cantidad: args.create.cantidad,
        ultimoMovimiento: args.create.ultimoMovimiento,
      };
      this.saldosStore.push(fila);
      return fila;
    },

    findMany: async (_args: {
      include: { insumo: { select: { nombre: true } } };
    }): Promise<(SaldoRow & { insumo: { nombre: string } })[]> => {
      return this.saldosStore.map((s) => {
        const insumo = this.insumosStore.find((i) => i.id === s.insumoId);
        return { ...s, insumo: { nombre: insumo?.nombre ?? "?" } };
      });
    },
  };

  insumo = {
    findUnique: async (args: {
      where: { id: string };
      select: { nombre: true; unidadBase: true };
    }): Promise<InsumoRow | null> => {
      return this.insumosStore.find((i) => i.id === args.where.id) ?? null;
    },
  };

  transformacionPermitida = {
    findFirst: async (args: {
      where: {
        insumoOrigenId: string;
        insumoDestinoId: string;
        activo: boolean;
        OR: { sucursalId: string | null }[];
      };
    }): Promise<PermitidaRow | null> => {
      const w = args.where;
      const sucursalesPermitidas = w.OR.map((o) => o.sucursalId);
      return (
        this.permitidasStore.find(
          (p) =>
            p.insumoOrigenId === w.insumoOrigenId &&
            p.insumoDestinoId === w.insumoDestinoId &&
            p.activo === w.activo &&
            sucursalesPermitidas.includes(p.sucursalId),
        ) ?? null
      );
    },
  };
}

// Singleton compartido: lo usan tanto el mock del módulo `../lib/prisma.js` (para las
// funciones que llaman al singleton, como auditarSaldos) como los tests que lo pasan como
// TransactionClient a asentarMovimientos/revertirMovimientos. Al ser el mismo objeto, un
// asiento y su auditoría ven el mismo estado.
export const fakePrisma = new FakePrisma();
