import * as XLSX from "xlsx";
import { z } from "@/lib/zod";

// ============================================================================
// Cabeçalho oficial da planilha (case-insensitive, sem acentos)
// ============================================================================

export const TEMPLATE_HEADERS = [
  "Nº Nota Fiscal",
  "Data Emissão",
  "Fornecedor",
  "Valor Frete",
  "Valor Total Produtos",
  "Valor Total NF",
  "DESCRIÇÃO NF",
  "Descrição Interna",
  "SKU",
  "COR",
  "Tamanho",
  "Categoria",
  "NCM/SH",
  "O/CSOSN",
  "CFOP",
  "UN",
  "QUANT",
  "VALOR UNIT",
  "VALOR TOTAL",
  "Custo Real",
  "Margem $",
  "Custo Margem",
  "$ Valor Comercial",
  "VALOR DESCONTO",
  "B.CÁLC ICMS",
  "VALOR ICMS",
  "VALOR IPI",
  "ALÍQ. ICMS",
  "ALÍQ. IPI",
] as const;

const rowSchema = z.object({
  invoiceNumber: z.string().min(1, "Nº Nota Fiscal obrigatório"),
  invoiceDate: z.date(),
  supplierName: z.string().min(1, "Fornecedor obrigatório"),
  freight: z.number().nonnegative(),
  productsTotal: z.number().nonnegative(),
  invoiceTotal: z.number().nonnegative(),
  invoiceDescription: z.string(),
  internalName: z.string().min(1, "Descrição Interna obrigatória"),
  sku: z.string().min(1, "SKU obrigatório"),
  colorName: z.string().min(1, "COR obrigatória"),
  sizeName: z.string().min(1, "Tamanho obrigatório"),
  categoryName: z.string().min(1, "Categoria obrigatória"),
  ncm: z.string().optional(),
  csosn: z.string().optional(),
  cfop: z.string().optional(),
  unit: z.string().default("UN"),
  quantity: z.number().int().positive("QUANT deve ser > 0"),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  realCost: z.number().nonnegative(),
  margin: z.number(),
  costMargin: z.number().nonnegative(),
  commercialValue: z.number().positive("$ Valor Comercial deve ser > 0"),
  discount: z.number().nonnegative().default(0),
  icmsBase: z.number().nonnegative().default(0),
  icmsValue: z.number().nonnegative().default(0),
  ipiValue: z.number().nonnegative().default(0),
  icmsRate: z.number().nonnegative().default(0),
  ipiRate: z.number().nonnegative().default(0),
});

export type ParsedRow = z.infer<typeof rowSchema>;

export interface ParseResult {
  rows: ParsedRow[];
  errors: { line: number; message: string; raw?: Record<string, unknown> }[];
  totalRows: number;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function normalize(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // remove caracteres ordinais e símbolos especiais comuns mantendo letras/dígitos/espaço/barra/cifrão
    .replace(/[^A-Za-z0-9 /$]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function excelDateToJs(serial: number | string): Date {
  if (typeof serial === "string") {
    // tenta dd/mm/yyyy
    const m = serial.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12));
    const d = new Date(serial);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  // Serial Excel (dias desde 1900-01-00, com bug do 1900 leap year), fixado ao meio-dia UTC
  const epoch = Date.UTC(1899, 11, 30, 12);
  return new Date(epoch + serial * 86400000);
}

// Mapa: cabeçalho normalizado → chave do schema
const HEADER_MAP: Record<string, keyof ParsedRow> = {
  "N NOTA FISCAL": "invoiceNumber",
  "NO NOTA FISCAL": "invoiceNumber",
  "DATA EMISSAO": "invoiceDate",
  FORNECEDOR: "supplierName",
  "VALOR FRETE": "freight",
  "VALOR TOTAL PRODUTOS": "productsTotal",
  "VALOR TOTAL NF": "invoiceTotal",
  "DESCRICAO NF": "invoiceDescription",
  "DESCRICAO INTERNA": "internalName",
  SKU: "sku",
  COR: "colorName",
  TAMANHO: "sizeName",
  CATEGORIA: "categoryName",
  "NCM/SH": "ncm",
  "O/CSOSN": "csosn",
  CFOP: "cfop",
  UN: "unit",
  QUANT: "quantity",
  "VALOR UNIT": "unitPrice",
  "VALOR TOTAL": "totalPrice",
  "CUSTO REAL": "realCost",
  "MARGEM $": "margin",
  "CUSTO MARGEM": "costMargin",
  "$ VALOR COMERCIAL": "commercialValue",
  "VALOR DESCONTO": "discount",
  "B CALC ICMS": "icmsBase",
  "VALOR ICMS": "icmsValue",
  "VALOR IPI": "ipiValue",
  "ALIQ ICMS": "icmsRate",
  "ALIQ IPI": "ipiRate",
};

// ----------------------------------------------------------------------------
// Parse principal
// ----------------------------------------------------------------------------

export function parseSpreadsheet(buffer: Buffer | ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { rows: [], errors: [{ line: 0, message: "Arquivo não tem nenhuma aba." }], totalRows: 0 };
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  if (matrix.length < 2) {
    return { rows: [], errors: [{ line: 0, message: "Planilha sem dados (linhas insuficientes)." }], totalRows: 0 };
  }

  const headerRow = (matrix[0] as unknown[]).map((h) => normalize(String(h)));
  const colIndex: Partial<Record<keyof ParsedRow, number>> = {};
  headerRow.forEach((h, i) => {
    const key = HEADER_MAP[h];
    if (key) colIndex[key] = i;
  });

  // Validar campos obrigatórios mapeados
  const required: (keyof ParsedRow)[] = [
    "invoiceNumber",
    "invoiceDate",
    "supplierName",
    "internalName",
    "sku",
    "colorName",
    "sizeName",
    "categoryName",
    "quantity",
    "commercialValue",
  ];
  const missing = required.filter((k) => colIndex[k] === undefined);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Cabeçalho ausente: ${missing.join(", ")}` }],
      totalRows: 0,
    };
  }

  const rows: ParsedRow[] = [];
  const errors: ParseResult["errors"] = [];

  for (let i = 1; i < matrix.length; i++) {
    const raw = matrix[i] as unknown[];
    if (!raw || raw.every((v) => v === "" || v === null)) continue;

    const get = <K extends keyof ParsedRow>(k: K): unknown => {
      const idx = colIndex[k];
      return idx === undefined ? undefined : raw[idx];
    };

    const obj = {
      invoiceNumber: String(get("invoiceNumber") ?? "").trim(),
      invoiceDate: excelDateToJs(get("invoiceDate") as number | string),
      supplierName: String(get("supplierName") ?? "").trim(),
      freight: toNumber(get("freight")),
      productsTotal: toNumber(get("productsTotal")),
      invoiceTotal: toNumber(get("invoiceTotal")),
      invoiceDescription: String(get("invoiceDescription") ?? "").trim(),
      internalName: String(get("internalName") ?? "").trim().toUpperCase(),
      sku: String(get("sku") ?? "").trim().toUpperCase(),
      colorName: String(get("colorName") ?? "").trim().toUpperCase(),
      sizeName: String(get("sizeName") ?? "").trim().toUpperCase(),
      categoryName: String(get("categoryName") ?? "").trim().toUpperCase(),
      ncm: String(get("ncm") ?? "").trim(),
      csosn: String(get("csosn") ?? "").trim(),
      cfop: String(get("cfop") ?? "").trim(),
      unit: String(get("unit") ?? "UN").trim() || "UN",
      quantity: Math.round(toNumber(get("quantity"))),
      unitPrice: toNumber(get("unitPrice")),
      totalPrice: toNumber(get("totalPrice")),
      realCost: toNumber(get("realCost")),
      margin: toNumber(get("margin")),
      costMargin: toNumber(get("costMargin")),
      commercialValue: toNumber(get("commercialValue")),
      discount: toNumber(get("discount")),
      icmsBase: toNumber(get("icmsBase")),
      icmsValue: toNumber(get("icmsValue")),
      ipiValue: toNumber(get("ipiValue")),
      icmsRate: toNumber(get("icmsRate")),
      ipiRate: toNumber(get("ipiRate")),
    };

    const parsed = rowSchema.safeParse(obj);
    if (!parsed.success) {
      errors.push({
        line: i + 1,
        message: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
        raw: obj as unknown as Record<string, unknown>,
      });
      continue;
    }
    rows.push(parsed.data);
  }

  return { rows, errors, totalRows: matrix.length - 1 };
}

// ----------------------------------------------------------------------------
// Geração do template (download)
// ----------------------------------------------------------------------------

export function generateTemplateBuffer(): Buffer {
  const sample: Record<string, string | number> = {
    "Nº Nota Fiscal": "000.000.001",
    "Data Emissão": new Date().toLocaleDateString("pt-BR"),
    Fornecedor: "Fornecedor Exemplo LTDA",
    "Valor Frete": 0,
    "Valor Total Produtos": 0,
    "Valor Total NF": 0,
    "DESCRIÇÃO NF": "Conjunto Camila short liso - Terra tamanho P",
    "Descrição Interna": "CJ SHORT CAMILA",
    SKU: "CJ-SHORT-CAMILA-TERRA-P",
    COR: "TERRA",
    Tamanho: "P",
    Categoria: "SHORT & BLUSA",
    "NCM/SH": "63090010",
    "O/CSOSN": "0/102",
    CFOP: 6101,
    UN: "UN",
    QUANT: 1,
    "VALOR UNIT": 60,
    "VALOR TOTAL": 60,
    "Custo Real": 64.22,
    "Margem $": 2.7,
    "Custo Margem": 173.39,
    "$ Valor Comercial": 179,
    "VALOR DESCONTO": 0,
    "B.CÁLC ICMS": 0,
    "VALOR ICMS": 0,
    "VALOR IPI": 0,
    "ALÍQ. ICMS": 0,
    "ALÍQ. IPI": 0,
  };

  const ws = XLSX.utils.json_to_sheet([sample], { header: TEMPLATE_HEADERS as unknown as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planilha1");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
  return out;
}
