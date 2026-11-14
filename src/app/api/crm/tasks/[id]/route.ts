import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { createAuditLogTx } from "@/lib/audit";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 try { const session = await requirePermission(request, "crm", "write"); const { id } = await params;
 const task = await prisma.$transaction(async tx => {
  const changed = await tx.crmTask.updateMany({ where: { id, status: "OPEN" }, data: { status: "DONE", completedAt: new Date() } });
  const found = await tx.crmTask.findUnique({ where: { id } }); if (!found) throw new NotFoundError("Tarefa");
  if (changed.count) await createAuditLogTx(tx, { session }, "COMPLETE", "CrmTask", id);
  return found;
 }); return NextResponse.json(task);
 } catch(error) { return handleApiError(error, request); }
}
