import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { runMaintenance } from "@/services/maintenance-service";

function sameSecret(received: string | null, expected: string): boolean {
  const a = Buffer.from(received ?? "");
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Ping público (monitoramento). As rotinas de manutenção só rodam com o
 * `Authorization: Bearer CRON_SECRET` que o cron da Vercel envia.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const { CRON_SECRET, NODE_ENV } = serverEnv();
  const authorization = request.headers.get("authorization");
  const isCron = CRON_SECRET ? sameSecret(authorization, CRON_SECRET) : NODE_ENV !== "production";
  if (!isCron) {
    if (authorization) {
      return NextResponse.json({ error: { message: "Não autorizado.", code: "UNAUTHORIZED" } }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, maintenance: await runMaintenance() });
}
