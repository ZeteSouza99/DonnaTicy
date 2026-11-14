import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError } from "@/lib/errors";
export async function GET(request: NextRequest) {
 try { await requirePermission(request, "crm", "read");
 return NextResponse.json({ data: await prisma.crmTask.findMany({ where: { status: "OPEN", customer: { deletedAt: null } }, include: { customer: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) });
 } catch(error) { return handleApiError(error, request); }
}
