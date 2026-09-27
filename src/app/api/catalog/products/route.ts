import { NextRequest, NextResponse } from "next/server";
import { AbcClass } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createProductSchema } from "@/schemas/catalog";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { parseEnumParam } from "@/lib/query-params";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "catalog", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search") ?? undefined;
    const collectionId = searchParams.get("collectionId") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const abcClass = parseEnumParam(searchParams.get("abcClass"), AbcClass, "abcClass");

    const where = {
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { code: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(collectionId && { collectionId }),
      ...(categoryId && { categoryId }),
      ...(abcClass && { abcClass }),
    };

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          collection: { select: { id: true, name: true } },
          line: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          _count: { select: { variants: true } },
        },
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.product.count({ where }),
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
    const input = createProductSchema.parse(body);

    const product = await prisma.product.create({
      data: {
        ...input,
        technology: input.technology ?? [],
      },
      include: {
        collection: { select: { id: true, name: true } },
        line: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Product",
      product.id,
      { code: input.code, name: input.name },
    );

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
