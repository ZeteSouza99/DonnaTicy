import { NextRequest, NextResponse } from "next/server";
import { ProductionOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createProductionOrderSchema } from "@/schemas/purchasing";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { generateCode } from "@/lib/code-generator";
import { parseEnumParam } from "@/lib/query-params";
import { parseDateOnly } from "@/lib/date";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "purchasing", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const status = parseEnumParam(searchParams.get("status"), ProductionOrderStatus, "status");
    const supplierId = searchParams.get("supplierId") ?? undefined;

    const where = {
      deletedAt: null,
      ...(status && { status }),
      ...(supplierId && { supplierId }),
    };

    const [data, total] = await Promise.all([
      prisma.productionOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, companyName: true } },
          collection: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.productionOrder.count({ where }),
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
    const input = createProductionOrderSchema.parse(body);

    // FK validation
    const supplier = await prisma.supplier.findFirst({
      where: { id: input.supplierId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundError("Fornecedor");

    const totalPieces = input.items.reduce((sum, i) => sum + i.quantity, 0);

    const order = await prisma.productionOrder.create({
      data: {
        code: generateCode("OP"),
        supplierId: input.supplierId,
        collectionId: input.collectionId,
        deadlineAt: input.deadlineAt ? parseDateOnly(input.deadlineAt) : undefined,
        unitCostCmt: input.unitCostCmt,
        technicalNotes: input.technicalNotes,
        totalPieces,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        },
      },
      include: {
        supplier: { select: { companyName: true } },
        items: {
          include: {
            product: { select: { code: true, name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "ProductionOrder",
      order.id,
      { code: order.code, totalPieces },
    );

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
