import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { generateTemplateBuffer } from "@/lib/import/spreadsheet-parser";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "imports", "read");
    const buffer = generateTemplateBuffer();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="template-importacao-donnaticy.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleApiError(error, request);
  }
}
