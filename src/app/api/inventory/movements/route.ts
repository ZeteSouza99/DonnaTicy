import { NextRequest, NextResponse } from "next/server";
import { StockMovementReason } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createStockMovementSchema } from "@/schemas/inventory";
import { createAuditLogTx, getClientIp } from "@/lib/audit";
import { parseEnumParam } from "@/lib/query-params";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "inventory", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const variantId = searchParams.get("variantId") ?? undefined;
    const reason = parseEnumParam(searchParams.get("reason"), StockMovementReason, "reason");

    const where = {
      ...(variantId && { variantId }),
      ...(reason && { reason }),
    };

    const [data, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          variant: {
            select: {
              sku: true,
              product: { select: { code: true, name: true } },
              color: { select: { name: true } },
              size: { select: { name: true } },
            },
          },
          fromLocation: { select: { name: true, code: true } },
          toLocation: { select: { name: true, code: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "inventory", "write");
    const body = await request.json();
    const input = createStockMovementSchema.parse(body);

    if (!input.fromLocationId && !input.toLocationId) {
      throw new ValidationError("Pelo menos uma localização (origem ou destino) é obrigatória.");
    }

    // FK validation
    const variant = await prisma.productVariant.findFirst({
      where: { id: input.variantId, deletedAt: null },
    });
    if (!variant) throw new NotFoundError("Variante");

    const movement = await prisma.$transaction(async (tx) => {
      // Decrease from source
      if (input.fromLocationId) {
        const position = await tx.stockPosition.findUnique({
          where: {
            variantId_locationId: {
              variantId: input.variantId,
              locationId: input.fromLocationId,
            },
          },
        });

        if (!position || position.quantity < input.quantity) {
          throw new ValidationError("Estoque insuficiente na localização de origem.");
        }

        await tx.stockPosition.update({
          where: { id: position.id },
          data: { quantity: { decrement: input.quantity } },
        });
      }

      // Increase at destination
      if (input.toLocationId) {
        await tx.stockPosition.upsert({
          where: {
            variantId_locationId: {
              variantId: input.variantId,
              locationId: input.toLocationId,
            },
          },
          update: { quantity: { increment: input.quantity } },
          create: {
            variantId: input.variantId,
            locationId: input.toLocationId,
            quantity: input.quantity,
          },
        });
      }

      const created = await tx.stockMovement.create({
        data: {
          variantId: input.variantId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          quantity: input.quantity,
          reason: input.reason,
          referenceId: input.referenceId,
          referenceType: input.referenceType,
          notes: input.notes,
        },
      });

      await createAuditLogTx(
        tx,
        { session, ipAddress: getClientIp(request) },
        "CREATE",
        "StockMovement",
        created.id,
        { variantId: input.variantId, quantity: input.quantity, reason: input.reason },
      );

      return created;
    });

    return NextResponse.json(movement, { status: 201 });
  } catch (error) {
    return handleApiError(error, request);
  }
}
