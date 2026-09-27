import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, requirePermission } from "@/lib/auth";
import { handleApiError, ConflictError } from "@/lib/errors";
import { createUserSchema } from "@/schemas/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { getPaginationParams, paginate } from "@/lib/pagination";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "users", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    const where = { deletedAt: null };

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          locationId: true,
          isActive: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: { name: "asc" },
      }),
      prisma.user.count({ where }),
    ]);

    void session;
    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "users", "write");
    const body = await request.json();
    const input = createUserSchema.parse(body);

    // Unique constraint check with soft-delete awareness
    const existingUser = await prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
    });
    if (existingUser) throw new ConflictError("E-mail já cadastrado.");

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role: input.role,
        locationId: input.locationId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locationId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "User",
      user.id,
      { email: user.email, role: user.role },
    );

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
