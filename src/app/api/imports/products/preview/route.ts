import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError } from "@/lib/errors";
import { previewSpreadsheet } from "@/lib/import/spreadsheet-preview";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await requirePermission(request, "imports", "write");
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) throw new ValidationError("Selecione a planilha XLSX.");
    return NextResponse.json(await previewSpreadsheet(file), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return handleApiError(error, request); }
}
