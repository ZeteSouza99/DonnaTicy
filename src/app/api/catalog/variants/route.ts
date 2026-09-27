import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createVariantSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const productId = searchParams.get("productId") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const where = {
      deletedAt: null,
      ...(productId && { productId }),
      ...(search && {
        OR: [
          { sku: { contains: search, mode: "insensitive" as const } },
          { barcode: { contains: search, mode: "insensitive" as const } },
          { product: { name: { contains: search, mode: "insensitive" as const } } },
          { product: { code: { contains: search, mode: "insensitive" as const } } },
          { product: { collection: { name: { contains: search, mode: "insensitive" as const } } } },
          { product: { line: { name: { contains: search, mode: "insensitive" as const } } } },
          { product: { category: { name: { contains: search, mode: "insensitive" as const } } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.productVariant.findMany({
        where,
        include: {
          product: {
            select: {
              id: true, code: true, name: true, basePrice: true, costPrice: true,
              collection: { select: { name: true } },
              line: { select: { name: true } },
              category: { select: { name: true } },
            },
          },
          color: { select: { id: true, name: true, hexValue: true } },
          size: { select: { id: true, name: true, code: true } },
          stockPositions: { select: { locationId: true, quantity: true, reservedQty: true } },
        },
        skip,
        take: limit,
        orderBy: { sku: "asc" },
      }),
      prisma.productVariant.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "catalog", "write");
    const body = await request.json();
    const input = createVariantSchema.parse(body);

    const variant = await prisma.productVariant.create({
      data: input,
      include: {
        product: { select: { id: true, code: true, name: true } },
        color: { select: { id: true, name: true, hexValue: true } },
        size: { select: { id: true, name: true, code: true } },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "ProductVariant",
      variant.id,
      { sku: input.sku },
    );

    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
