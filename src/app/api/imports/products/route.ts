import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError } from "@/lib/errors";
import { createImportJob, listImportJobs } from "@/services/import-job-service";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
 try { const session = await requirePermission(request,"imports","read"); return NextResponse.json({ data: await listImportJobs(session.sub) }); } catch(error) { return handleApiError(error,request); }
}
export async function POST(request: NextRequest) {
 try {
  const session = await requirePermission(request,"imports","write");
  const data = await request.formData(), file = data.get("file");
  if(!(file instanceof File)) throw new ValidationError("Selecione a planilha .xlsx.");
  return NextResponse.json(await createImportJob(session.sub,file,data.get("dryRun") === "true"), { status: 202 });
 } catch(error) { return handleApiError(error,request); }
}
