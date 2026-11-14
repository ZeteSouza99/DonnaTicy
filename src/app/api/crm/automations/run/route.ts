import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { runAutomations } from "@/services/automation-service";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
 try { await requirePermission(request, "crm", "write"); return NextResponse.json({ processed: await runAutomations() }); }
 catch(error) { return handleApiError(error, request); }
}
