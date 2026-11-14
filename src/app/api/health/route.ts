import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
/** Somente leitura: manutenção possui rota autenticada própria. */
export async function GET(): Promise<NextResponse> {
 try { await prisma.$queryRaw`SELECT 1`; return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}}); }
 catch { return NextResponse.json({ok:false},{status:503}); }
}
