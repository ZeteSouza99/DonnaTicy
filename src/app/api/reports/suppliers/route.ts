import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

// Performance de fornecedores: pedidos, valor, scores
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "reports", "read");

    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null },
      include: {
        purchaseOrders: {
          where: { deletedAt: null },
          select: { id: true, code: true, status: true, totalAmount: true, createdAt: true, expectedAt: true },
        },
        primaryMaterials: { select: { id: true } },
      },
      orderBy: { companyName: "asc" },
    });

    const rows = suppliers.map((s) => {
      const orders = s.purchaseOrders;
      const totalSpent = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
      const completed = orders.filter((o) => o.status === "RECEIVED" || o.status === "PARTIALLY_RECEIVED").length;
      const pending = orders.filter((o) => o.status === "DRAFT" || o.status === "PENDING_APPROVAL" || o.status === "APPROVED" || o.status === "SENT_TO_SUPPLIER").length;
      const cancelled = orders.filter((o) => o.status === "CANCELLED").length;
      return {
        id: s.id,
        type: s.type,
        companyName: s.companyName,
        tradeName: s.tradeName,
        cnpj: s.cnpj,
        contactName: s.contactName,
        phone: s.phone,
        email: s.email,
        qualityScore: s.qualityScore,
        deliveryScore: s.deliveryScore,
        avgScore: (s.qualityScore + s.deliveryScore) / 2,
        paymentTerms: s.paymentTerms,
        minOrderValue: s.minOrderValue,
        materialsCount: s.primaryMaterials.length,
        ordersCount: orders.length,
        completedOrders: completed,
        pendingOrders: pending,
        cancelledOrders: cancelled,
        totalSpent,
        avgOrderValue: orders.length > 0 ? totalSpent / orders.length : 0,
        isActive: s.isActive,
      };
    });

    const summary = {
      total: rows.length,
      active: rows.filter((r) => r.isActive).length,
      totalSpent: rows.reduce((s, r) => s + r.totalSpent, 0),
      totalOrders: rows.reduce((s, r) => s + r.ordersCount, 0),
      avgQuality: rows.length > 0 ? rows.reduce((s, r) => s + r.qualityScore, 0) / rows.length : 0,
      avgDelivery: rows.length > 0 ? rows.reduce((s, r) => s + r.deliveryScore, 0) / rows.length : 0,
      byType: {
        FABRIC_SUPPLIER: rows.filter((r) => r.type === "FABRIC_SUPPLIER").length,
        TRIM_SUPPLIER: rows.filter((r) => r.type === "TRIM_SUPPLIER").length,
        CMT_FACTORY: rows.filter((r) => r.type === "CMT_FACTORY").length,
        FULL_PACKAGE: rows.filter((r) => r.type === "FULL_PACKAGE").length,
      },
    };

    return NextResponse.json(
      { summary, rows },
      { headers: { "Cache-Control": "private, max-age=0, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
