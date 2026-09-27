import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { generateTemplateBuffer, parseSpreadsheet } from "@/lib/import/spreadsheet-parser";

describe("planilha de importação (SheetJS)", () => {
  it("lê o próprio modelo de download sem erros", () => {
    const result = parseSpreadsheet(generateTemplateBuffer());
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ sku: "CJ-SHORT-CAMILA-TERRA-P", quantity: 1, commercialValue: 179 });
  });

  it("aponta cabeçalhos obrigatórios ausentes", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["SKU", "COR"], ["X", "PRETO"]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Planilha");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = parseSpreadsheet(buffer);
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].message).toMatch(/Cabeçalho ausente/);
  });
});
