import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

// Clientes detalhados: LTV, ticket médio, RFM, churn
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "reports", "read");

    const customers = await prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { lifetimeValue: "desc" },
    });

    const now = Date.now();
    const rows = customers.map((c) => {
      const daysSince = c.lastPurchaseAt
        ? Math.floor((now - c.lastPurchaseAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      return {
        id: c.id,
        code: c.code,
        name: c.fullName,
        email: c.email,
        phone: c.phone,
        cpf: c.cpf,
        tier: c.tier,
        lifetimeValue: Number(c.lifetimeValue),
        totalOrders: c.totalOrders,
        avgTicket: Number(c.avgTicket),
        loyaltyPoints: c.loyaltyPoints,
        firstPurchaseAt: c.firstPurchaseAt,
        lastPurchaseAt: c.lastPurchaseAt,
        daysSinceLastPurchase: daysSince,
        avgRepurchaseDays: c.avgRepurchaseDays,
        churnRisk: c.churnRisk,
        acquisitionChannel: c.acquisitionChannel,
        createdAt: c.createdAt,
        isActive: c.isActive,
      };
    });

    const summary = {
      total: rows.length,
      active: rows.filter((r) => r.isActive).length,
      totalLTV: rows.reduce((s, r) => s + r.lifetimeValue, 0),
      avgLTV: rows.length > 0 ? rows.reduce((s, r) => s + r.lifetimeValue, 0) / rows.length : 0,
      totalOrders: rows.reduce((s, r) => s + r.totalOrders, 0),
      avgTicket: (() => {
        const withOrders = rows.filter((r) => r.totalOrders > 0);
        return withOrders.length > 0 ? withOrders.reduce((s, r) => s + r.avgTicket, 0) / withOrders.length : 0;
      })(),
      byTier: {
        BRONZE: rows.filter((r) => r.tier === "BRONZE").length,
        SILVER: rows.filter((r) => r.tier === "SILVER").length,
        GOLD: rows.filter((r) => r.tier === "GOLD").length,
        VIP: rows.filter((r) => r.tier === "VIP").length,
      },
      churnRisk: {
        LOW: rows.filter((r) => r.churnRisk === "LOW").length,
        MEDIUM: rows.filter((r) => r.churnRisk === "MEDIUM").length,
        HIGH: rows.filter((r) => r.churnRisk === "HIGH").length,
        CHURNED: rows.filter((r) => r.churnRisk === "CHURNED").length,
      },
      noPurchases: rows.filter((r) => r.totalOrders === 0).length,
    };

    return NextResponse.json(
      { summary, rows },
      { headers: { "Cache-Control": "private, max-age=0, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
