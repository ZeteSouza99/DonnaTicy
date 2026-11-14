import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/errors";
import { operationalSettingsSchema } from "@/lib/operational-settings";
import { getOperationalSettings } from "@/services/settings-service";
import { createAuditLogTx, getClientIp } from "@/lib/audit";
export async function GET(request: NextRequest) {
  try { await requirePermission(request, "settings", "read"); return NextResponse.json(await getOperationalSettings()); }
  catch (error) { return handleApiError(error, request); }
}
export async function PUT(request: NextRequest) {
  try {
    const session = await requirePermission(request, "settings", "manage");
    const value = operationalSettingsSchema.parse(await request.json());
    await prisma.$transaction(async (tx) => {
      await tx.setting.upsert({ where: { key: "operational" }, create: { key: "operational", group: "operation", value }, update: { value } });
      await createAuditLogTx(tx, { session, ipAddress: getClientIp(request) }, "UPDATE", "Setting", "operational", value);
    });
    return NextResponse.json(value);
  } catch (error) { return handleApiError(error, request); }
}
