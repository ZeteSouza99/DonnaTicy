import { NextRequest, NextResponse } from "next/server";
import { CustomerTier, ChurnRisk } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ConflictError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createCustomerSchema } from "@/schemas/sales";
import { createAuditLog, getClientIp } from "@/lib/audit";
import { generateCustomerCode } from "@/lib/code-generator";
import { parseEnumParam } from "@/lib/query-params";
import { parseDateOnly } from "@/lib/date";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "customers", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search") ?? undefined;
    const tier = parseEnumParam(searchParams.get("tier"), CustomerTier, "tier");
    const churnRisk = parseEnumParam(searchParams.get("churnRisk"), ChurnRisk, "churnRisk");

    const where = {
      deletedAt: null,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search, mode: "insensitive" as const } },
          { cpf: { contains: search } },
          { code: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(tier && { tier }),
      ...(churnRisk && { churnRisk }),
    };

    const [data, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          code: true,
          fullName: true,
          email: true,
          phone: true,
          tier: true,
          lifetimeValue: true,
          totalOrders: true,
          avgTicket: true,
          lastPurchaseAt: true,
          churnRisk: true,
          loyaltyPoints: true,
          isActive: true,
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: { fullName: "asc" },
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "customers", "write");
    const body = await request.json();
    const input = createCustomerSchema.parse(body);

    // Unique constraint checks with soft-delete awareness
    if (input.email) {
      const existingEmail = await prisma.customer.findFirst({
        where: { email: input.email, deletedAt: null },
      });
      if (existingEmail) throw new ConflictError("E-mail já cadastrado.");
    }

    const existingPhone = await prisma.customer.findFirst({
      where: { phone: input.phone, deletedAt: null },
    });
    if (existingPhone) throw new ConflictError("Telefone já cadastrado.");

    if (input.cpf) {
      const existingCpf = await prisma.customer.findFirst({
        where: { cpf: input.cpf, deletedAt: null },
      });
      if (existingCpf) throw new ConflictError("CPF já cadastrado.");
    }

    const customer = await prisma.customer.create({
      data: {
        code: generateCustomerCode(),
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        cpf: input.cpf,
        birthDate: input.birthDate ? parseDateOnly(input.birthDate) : undefined,
        gender: input.gender,
        whatsappOptIn: input.whatsappOptIn,
        emailOptIn: input.emailOptIn,
        smsOptIn: input.smsOptIn,
        acquisitionChannel: input.acquisitionChannel,
        referredById: input.referredById,
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "Customer",
      customer.id,
      { code: customer.code, fullName: customer.fullName },
    );

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
