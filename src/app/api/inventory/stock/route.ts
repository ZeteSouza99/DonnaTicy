import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "inventory", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const locationId = searchParams.get("locationId") ?? undefined;
    const variantId = searchParams.get("variantId") ?? undefined;
    const belowMin = searchParams.get("belowMin") === "true";

    const baseWhere = {
      variant: { deletedAt: null, product: { deletedAt: null } },
      ...(locationId && { locationId }),
      ...(variantId && { variantId }),
    };

    const includeRelations = {
      variant: {
        select: {
          id: true,
          sku: true,
          product: { select: { id: true, code: true, name: true } },
          color: { select: { name: true, hexValue: true } },
          size: { select: { name: true, code: true } },
        },
      },
      location: { select: { id: true, name: true, code: true, type: true } },
    };

    // Prisma doesn't support column-to-column comparison in where clause
    // For belowMin, fetch all and filter in memory with correct pagination
    if (belowMin) {
      const allPositions = await prisma.stockPosition.findMany({
        where: baseWhere,
        include: includeRelations,
        orderBy: { updatedAt: "desc" },
      });

      const filtered = allPositions.filter((sp) => sp.quantity <= sp.minStock);
      const paginatedData = filtered.slice(skip, skip + limit);
      return NextResponse.json(paginate(paginatedData, filtered.length, page, limit));
    }

    const [data, total] = await Promise.all([
      prisma.stockPosition.findMany({
        where: baseWhere,
        include: includeRelations,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.stockPosition.count({ where: baseWhere }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}
