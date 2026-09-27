import { NextRequest, NextResponse } from "next/server";
import { PurchaseOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createPurchaseOrderSchema } from "@/schemas/purchasing";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { generateCode } from "@/lib/code-generator";
import { parseEnumParam } from "@/lib/query-params";
import { parseDateOnly } from "@/lib/date";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "purchasing", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const status = parseEnumParam(searchParams.get("status"), PurchaseOrderStatus, "status");
    const supplierId = searchParams.get("supplierId") ?? undefined;

    const where = {
      deletedAt: null,
      ...(status && { status }),
      ...(supplierId && { supplierId }),
    };

    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, companyName: true, tradeName: true } },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "purchasing", "write");
    const body = await request.json();
    const input = createPurchaseOrderSchema.parse(body);

    // FK validation
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundError("Fornecedor");

    const items = input.items.map((item) => ({
      rawMaterialId: item.rawMaterialId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
    }));

    const totalAmount = items.reduce((sum, i) => sum + i.totalPrice, 0);

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        code: generateCode("OC"),
        supplierId: input.supplierId,
        expectedAt: input.expectedAt ? parseDateOnly(input.expectedAt) : undefined,
        notes: input.notes,
        totalAmount,
        items: { create: items },
      },
      include: {
        supplier: { select: { companyName: true } },
        items: {
          include: { rawMaterial: { select: { code: true, name: true } } },
        },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "PurchaseOrder",
      purchaseOrder.id,
      { code: purchaseOrder.code, totalAmount },
    );

    return NextResponse.json(purchaseOrder, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
