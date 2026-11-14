import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getImportJob, advanceImportJob } from "@/services/import-job-service";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, {params}: Context) {
 try { const session = await requirePermission(request,"imports","read"); return NextResponse.json(await getImportJob((await params).id,session.sub)); } catch(error) { return handleApiError(error,request); }
}
export async function POST(request: NextRequest, {params}: Context) {
 try { const session = await requirePermission(request,"imports","write"); return NextResponse.json(await advanceImportJob((await params).id,session.sub,request.nextUrl.searchParams.get("retry") === "true")); } catch(error) { return handleApiError(error,request); }
}
