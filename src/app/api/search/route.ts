import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/errors";
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    if (q.length < 2) return NextResponse.json({ results: [] });
    const contains = { contains: q, mode: "insensitive" as const };
    const [products, customers, orders] = await Promise.all([
      can(session.role, "catalog", "read") ? prisma.product.findMany({ where: { deletedAt: null, OR: [{ name: contains }, { code: contains }] }, select: { id: true, name: true, code: true }, take: 5 }) : [],
      can(session.role, "customers", "read") ? prisma.customer.findMany({ where: { deletedAt: null, OR: [{ fullName: contains }, { phone: contains }] }, select: { id: true, fullName: true, code: true }, take: 5 }) : [],
      can(session.role, "orders", "read") ? prisma.order.findMany({ where: { deletedAt: null, code: contains }, select: { id: true, code: true }, take: 5 }) : [],
    ]);
    return NextResponse.json({ results: [...products.map((p) => ({ id: p.id, label: p.name, detail: `Produto · ${p.code}`, href: `/dashboard/catalogo/${p.id}` })), ...customers.map((c) => ({ id: c.id, label: c.fullName, detail: `Cliente · ${c.code}`, href: `/dashboard/clientes/${c.id}` })), ...orders.map((o) => ({ id: o.id, label: o.code, detail: "Pedido", href: `/dashboard/vendas/${o.id}` }))] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch(error) { return handleApiError(error, request); }
}
