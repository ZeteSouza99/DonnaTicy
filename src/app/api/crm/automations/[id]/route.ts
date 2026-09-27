import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateAutomationTriggerSchema } from "@/schemas/crm";
import { createAuditLog, getClientIp } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "crm", "read");
    const { id } = await params;

    const trigger = await prisma.automationTrigger.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { executions: true } },
        executions: {
          orderBy: { sentAt: "desc" },
          take: 20,
          select: {
            id: true,
            customerId: true,
            channel: true,
            status: true,
            sentAt: true,
            convertedAt: true,
          },
        },
      },
    });

    if (!trigger) throw new NotFoundError("Automação");
    return NextResponse.json(trigger);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "crm", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateAutomationTriggerSchema.parse(body);

    const existing = await prisma.automationTrigger.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Automação");

    const trigger = await prisma.automationTrigger.update({
      where: { id },
      data: input as Prisma.AutomationTriggerUpdateInput,
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "AutomationTrigger",
      id,
      input,
    );

    return NextResponse.json(trigger);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "crm", "write");
    const { id } = await params;

    const existing = await prisma.automationTrigger.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Automação");

    await prisma.automationTrigger.update({ where: { id }, data: { deletedAt: new Date() } });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "AutomationTrigger",
      id,
    );

    return NextResponse.json({ message: "Automação removida com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
