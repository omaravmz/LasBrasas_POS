import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      db: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "error",
      db: "unreachable",
      timestamp: new Date().toISOString(),
    });
  }
}
