import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { createAutomationTriggerSchema } from "@/schemas/crm";
import { createAuditLog, getClientIp } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "crm", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const active = searchParams.get("active");

    const where = {
      deletedAt: null,
      ...(active === "true" && { isActive: true }),
      ...(active === "false" && { isActive: false }),
    };

    const [data, total] = await Promise.all([
      prisma.automationTrigger.findMany({
        where,
        include: { _count: { select: { executions: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.automationTrigger.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "crm", "write");
    const body = await request.json();
    const input = createAutomationTriggerSchema.parse(body);

    const trigger = await prisma.automationTrigger.create({
      data: input as Prisma.AutomationTriggerCreateInput,
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "CREATE",
      "AutomationTrigger",
      trigger.id,
      { name: input.name, conditionType: input.conditionType },
    );

    return NextResponse.json(trigger, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
