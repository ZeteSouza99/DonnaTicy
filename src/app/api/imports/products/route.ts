import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { parseSpreadsheet } from "@/lib/import/spreadsheet-parser";
import { executeImport } from "@/lib/import/run-import";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "imports", "write");

    const formData = await request.formData();
    const file = formData.get("file");
    const dryRun = formData.get("dryRun") === "true";

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo .xlsx é obrigatório (campo 'file')." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parsed = parseSpreadsheet(buffer);

    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Erros impeditivos no arquivo.",
          parseErrors: parsed.errors,
          totalRows: parsed.totalRows,
        },
        { status: 422 }
      );
    }

    const summary = await executeImport(parsed.rows, dryRun);

    return NextResponse.json({
      ok: true,
      dryRun,
      totalRows: parsed.totalRows,
      validRows: parsed.rows.length,
      parseErrors: parsed.errors,
      summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
