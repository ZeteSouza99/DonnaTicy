import { ValidationError } from "@/lib/errors";
import { parseSpreadsheet } from "./spreadsheet-parser";
import { detectImportFormat } from "./import-files";

export async function previewSpreadsheet(file: File) {
  try { if (detectImportFormat([file]) !== "xlsx") throw new Error("Selecione uma planilha XLSX."); }
  catch (e) { throw new ValidationError(e instanceof Error ? e.message : "Planilha inválida."); }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new ValidationError("O arquivo não é uma planilha XLSX válida.");
  let parsed: ReturnType<typeof parseSpreadsheet>;
  try { parsed = parseSpreadsheet(buffer); }
  catch { throw new ValidationError("Não foi possível ler a planilha. Confira o arquivo e use o modelo disponível."); }
  if (parsed.totalRows > 5000) throw new ValidationError("Cada lote aceita até 5.000 linhas.");
  const counts = new Map<string, number>();
  for (const row of parsed.rows) {
    const key = JSON.stringify([row.invoiceNumber, row.supplierName]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const errors = parsed.errors.map(({ line, message }) => ({ line, message }));
  if ([...counts.values()].some(count => count > 200)) errors.push({ line: 0, message: "Uma nota pode ter até 200 linhas por lote." });
  return {
    rows: parsed.rows,
    errors,
    totalRows: parsed.totalRows,
    totalUnits: parsed.rows.reduce((total, row) => total + row.quantity, 0),
    invoices: counts.size,
    canImport: parsed.rows.length > 0 && errors.length === 0,
  };
}
export type SpreadsheetPreview = Awaited<ReturnType<typeof previewSpreadsheet>>;
