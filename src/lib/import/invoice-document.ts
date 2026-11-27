import { z } from "@/lib/zod";

const text = z.string().trim().min(1).max(200);
const money = z.number().finite().nonnegative().max(99_999_999);
export const invoiceLineSchema = z.object({
  line: z.number().int().positive(), code: text, description: text,
  ncm: z.string().max(8).default(""), unit: z.string().trim().min(1).max(10),
  quantity: z.number().finite().positive().max(100000), unitPrice: money, total: money,
  barcode: z.string().max(14).default(""),
});
export const invoiceDocumentSchema = z.object({
  source: z.enum(["xml", "pdf", "ocr"]), fileName: text,
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  accessKey: z.string().regex(/^\d{44}$/), number: z.string().regex(/^\d{1,9}$/),
  series: z.string().regex(/^\d{1,3}$/), supplierName: text,
  supplierDocument: z.string().regex(/^\d{14}$/),
  issueDate: z.iso.date(), productsTotal: money, freight: money,
  discount: money, invoiceTotal: money,
  items: z.array(invoiceLineSchema).min(1).max(200),
});
export type InvoiceDocument = z.infer<typeof invoiceDocumentSchema>;
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

function isTeaBox(item: InvoiceLine) {
  return item.unit.toUpperCase().replace(/\.$/, "") === "CX" && /^CH[AÁ](?:\s|$)/i.test(item.description);
}

/** View used for stock, pricing and sale. The draft keeps the supplier's original packaging. */
export function saleUnitLine(item: InvoiceLine): InvoiceLine {
  if (!/^UN\.?$/i.test(item.unit) || !/^ENERG[EÉ]TICO XPLOD DISPLAY COM 24 FLACONETES$/i.test(item.description)) return item;
  return {
    ...item, quantity: item.quantity * 24, unitPrice: item.unitPrice / 24,
    description: "ENERGÉTICO XPLOD FLACONETE", unit: "UN", barcode: "",
  };
}
export const receiptAllocationSchema = z.object({
  quantity: z.number().int().positive().max(100000),
  variantId: z.string().min(1).max(100).optional(),
  color: z.string().trim().max(60).default(""), size: z.string().trim().max(10).default(""),
}).superRefine((value, ctx) => {
  if (!value.variantId && (!value.color || !value.size)) ctx.addIssue({ code: "custom", message: "Informe cor e tamanho ou escolha uma variante cadastrada." });
});
export const receiptReviewSchema = z.object({
  locationId: text, collectionId: text, lineId: text,
  confirmed: z.literal(true),
  items: z.array(z.object({
    line: z.number().int().positive(), categoryId: z.string().max(100).default(""),
    code: text.optional(), description: text.optional(),
    salePrice: money, allocations: z.array(receiptAllocationSchema).min(1).max(100),
  })).min(1).max(200),
});
export type ReceiptReview = z.infer<typeof receiptReviewSchema>;

const receiptDraftSchema = receiptReviewSchema.extend({
  locationId: z.string().max(200), collectionId: z.string().max(200), lineId: z.string().max(200),
  items: z.array(z.object({
    line: z.number().int().positive(), categoryId: z.string().max(100).default(""), salePrice: money,
    code: z.string().trim().max(200).optional(), description: z.string().trim().max(200).optional(),
    allocations: z.array(z.object({
      quantity: z.number().int().nonnegative().max(100000), variantId: z.string().min(1).max(100).optional(),
      color: z.string().trim().max(60).default(""), size: z.string().trim().max(10).default(""),
    })).min(1).max(100),
  })).min(1).max(200),
});

export function validateReceiptDraft(doc: InvoiceDocument, input: unknown): ReceiptReview {
  const draft = receiptDraftSchema.parse(input);
  if (draft.items.length !== doc.items.length || new Set(draft.items.map(i=>i.line)).size !== doc.items.length || draft.items.some(i=>!doc.items.some(line=>line.line===i.line))) throw new Error("O rascunho deve conter todos os itens da nota.");
  if (draft.items.reduce((sum,i)=>sum+i.allocations.length,0)>400) throw new Error("Limite de 400 variações por nota.");
  return {...draft,items:draft.items.sort((a,b)=>a.line-b.line)};
}

export function validAccessKey(key: string): boolean {
  if (!/^\d{44}$/.test(key) || /^0+$/.test(key) || key.slice(20, 22) !== "55") return false;
  let sum = 0;
  for (let i = 42, weight = 2; i >= 0; i--, weight = weight === 9 ? 2 : weight + 1) sum += Number(key[i]) * weight;
  const rest = sum % 11;
  return Number(key[43]) === (rest < 2 ? 0 : 11 - rest);
}

/** Confere completude e identidade antes de aceitar qualquer estoque. */
export function validateInvoiceDocument(input: unknown): InvoiceDocument {
  const doc = invoiceDocumentSchema.parse(input);
  if (!validAccessKey(doc.accessKey)) throw new Error("Chave de acesso da NF-e inválida. Confira a leitura ou envie o XML.");
  if (doc.accessKey.slice(6, 20) !== doc.supplierDocument || Number(doc.accessKey.slice(22, 25)) !== Number(doc.series) || Number(doc.accessKey.slice(25, 34)) !== Number(doc.number)) throw new Error("Número, série ou CNPJ não correspondem à chave de acesso.");
  const lines = new Set(doc.items.map(i => i.line));
  if (lines.size !== doc.items.length || doc.items.some((i, index) => i.line !== index + 1)) throw new Error("A sequência de itens está incompleta ou repetida. Envie todas as páginas ou o XML.");
  for (const item of doc.items) {
    if (!Number.isInteger(item.quantity)) throw new Error(`Item ${item.line}: quantidade fracionada. Esta entrada aceita somente peças inteiras.`);
    if (!isTeaBox(item) && !["UN", "UND", "UNID", "UNIDADE", "PC", "PÇ", "PECA", "PEÇA"].includes(item.unit.toUpperCase().replace(/\.$/, ""))) throw new Error(`Item ${item.line}: unidade ${item.unit} exige conversão para peças. Utilize uma entrada com conversão conferida.`);
    if (Math.abs(Math.round(item.quantity * item.unitPrice * 100) - Math.round(item.total * 100)) > 1) throw new Error(`Item ${item.line}: quantidade e custo não fecham com o total. Confira o documento.`);
  }
  const total = doc.items.reduce((sum, item) => sum + Math.round(item.total * 100), 0);
  if (Math.abs(total - Math.round(doc.productsTotal * 100)) > 1) throw new Error("A soma dos itens não fecha com o total dos produtos. A leitura pode estar incompleta; envie todas as páginas ou o XML.");
  if (doc.discount > doc.productsTotal || Math.round(doc.invoiceTotal*100) < Math.round((doc.productsTotal - doc.discount + doc.freight)*100)) throw new Error("Totais da nota inconsistentes. Confira o documento.");
  return doc;
}

export function validateReceiptReview(doc: InvoiceDocument, input: unknown): ReceiptReview {
  const review = receiptReviewSchema.parse(input);
  const codes = new Map<string,string>();
  if (review.items.length !== doc.items.length || new Set(review.items.map(i => i.line)).size !== doc.items.length) throw new Error("Confira todos os itens da nota, sem repetir linhas.");
  for (const original of doc.items) {
    const item = saleUnitLine(original);
    const checked = review.items.find(i => i.line === item.line);
    if (!checked || checked.allocations.reduce((sum, a) => sum + a.quantity, 0) !== item.quantity) throw new Error(`Item ${item.line}: a distribuição por cor e tamanho deve somar ${item.quantity} peças.`);
    if (checked.allocations.some(a => !a.variantId) && (!checked.categoryId || checked.salePrice <= 0)) throw new Error(`Item ${item.line}: informe categoria e preço de venda para criar o produto.`);
    if (checked.allocations.some(a=>!a.variantId)) {
      const code=(checked.code??item.code).toUpperCase(), description=(checked.description??item.description).toUpperCase();
      if (codes.has(code) && codes.get(code)!==description) throw new Error(`Item ${item.line}: código do fornecedor repetido para descrições diferentes. Confira e corrija a leitura do código.`);
      codes.set(code,description);
    }
  }
  if (review.items.reduce((sum,i)=>sum+i.allocations.length,0) > 400) throw new Error("Divida a entrada: limite de 400 variações por nota.");
  return review;
}

/** Ordena a camada de texto do PDF por coordenadas, sem depender da ordem interna dos objetos. */
export function pdfTextLines(items: Array<{ str: string; x: number; y: number }>): string {
  const lines: Array<{ y: number; parts: typeof items }> = [];
  for (const item of [...items].sort((a,b)=>b.y-a.y || a.x-b.x)) {
    const line = lines.find(l => Math.abs(l.y-item.y) < 2);
    if (line) line.parts.push(item); else lines.push({y:item.y,parts:[item]});
  }
  return lines.map(l=>l.parts.sort((a,b)=>a.x-b.x).map(p=>p.str).join(" ")).join("\n");
}

function brNumber(text: string) { return Number(text.replace(/\./g, "").replace(",", ".")); }

/** DANFE tabular: nunca completa valores ausentes por suposição. Outras diagramações usam XML. */
export function parseDanfeText(raw: string, metadata: Pick<InvoiceDocument,"source"|"fileName"|"fileHash">): InvoiceDocument {
  // O OCR pode transformar as bordas verticais da tabela em colchetes ou barras.
  // Removemos somente esses separadores; dígitos e letras lidos não são adivinhados.
  const content = raw.replace(/\u00a0/g," ").replace(metadata.source==="ocr" ? /[|\[\]]/g : /\u0000/g," ");
  const key = content.match(/(?:\d{4}[ \t]+){10}\d{4}|\b\d{44}\b/)?.[0].replace(/\s/g, "") ?? "";
  if (!validAccessKey(key)) throw new Error("Não foi possível ler a chave de acesso. Envie um PDF legível, foto nítida ou o XML da NF-e.");
  const supplier = content.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i)?.[1]?.trim();
  const dateSection = content.slice(content.indexOf("DATA DA EMISS"));
  const date = dateSection.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!supplier || !date) throw new Error("Fornecedor ou data não reconhecidos neste DANFE. Prefira o XML ou uma imagem completa da primeira página.");
  const valuesAfter = (label: RegExp) => {
    const match = label.exec(content);
    if (!match) throw new Error("Os totais da nota não foram reconhecidos. Envie o XML.");
    const line = content.slice(match.index + match[0].length).split(/\r?\n/).find(l=>/\d,\d{2}/.test(l));
    return (line?.match(/\d[\d.]*,\d{2}\b/g) ?? []).map(brNumber);
  };
  const products = valuesAfter(/VALOR TOTAL DOS PRODUTOS/i).at(-1);
  const totals = valuesAfter(/VALOR TOTAL DA NOTA/i);
  if (products === undefined || totals.length !== 6) throw new Error("Os totais não seguem o formato esperado. Envie o XML para uma leitura precisa.");
  const items: InvoiceLine[] = [];
  const pattern = /^\s*(\S+)\s+(.+?)\s+(\d{8})\s+(\d{3,4})\s+(\d{4})\s+(\S+)\s+(\d[\d.]*,\d{1,4})\s+(\d[\d.]*,\d{1,4})\s+(\d[\d.]*,\d{2})(?:\s|$)/gm;
  for (const row of content.matchAll(pattern)) items.push({line:items.length+1,code:row[1],description:row[2].trim(),ncm:row[3],unit:row[6],quantity:brNumber(row[7]),unitPrice:brNumber(row[8]),total:brNumber(row[9]),barcode:""});
  if (!items.length) throw new Error("Não foi possível reconhecer a tabela de produtos. Envie uma imagem mais nítida, o PDF original ou o XML.");
  return validateInvoiceDocument({...metadata,accessKey:key,number:String(Number(key.slice(25,34))),series:String(Number(key.slice(22,25))),supplierName:supplier,supplierDocument:key.slice(6,20),issueDate:`${date[3]}-${date[2]}-${date[1]}`,productsTotal:products,freight:totals[0],discount:totals[2],invoiceTotal:totals[5],items});
}
