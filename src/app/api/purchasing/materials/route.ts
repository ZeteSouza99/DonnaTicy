import { NextRequest, NextResponse } from "next/server";
import { RawMaterialCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createRawMaterialSchema } from "@/schemas/purchasing";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { parseEnumParam } from "@/lib/query-params";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "purchasing", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search") ?? undefined;
    const category = parseEnumParam(searchParams.get("category"), RawMaterialCategory, "category");

    const where = {
      deletedAt: null,
      ...(category && { category }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { code: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.rawMaterial.findMany({
        where,
        include: {
          primarySupplier: { select: { id: true, companyName: true } },
          backupSupplier: { select: { id: true, companyName: true } },
        },
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.rawMaterial.count({ where }),
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
    const input = createRawMaterialSchema.parse(body);

    const material = await prisma.rawMaterial.create({
      data: input,
      include: {
        primarySupplier: { select: { id: true, companyName: true } },
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "RawMaterial",
      material.id,
      { code: input.code, name: input.name },
    );

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
