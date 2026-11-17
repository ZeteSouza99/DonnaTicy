import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { detectImportFormat } from "@/lib/import/import-files";
import { previewSpreadsheet } from "@/lib/import/spreadsheet-preview";
import { generateTemplateBuffer } from "@/lib/import/spreadsheet-parser";

const file = (name: string, size = 100) => ({ name, size });
describe("entrada única de arquivos", () => {
  it.each([["compra.XLSX","xlsx"],["nota.XML","xml"],["nota.PDF","pdf"],["foto.JPG","photo"],["foto.jpeg","photo"],["foto.png","photo"],["foto.webp","photo"]] as const)("identifica %s", (name, format) => expect(detectImportFormat([file(name)])).toBe(format));
  it("aceita fotos das páginas em formatos diferentes", () => expect(detectImportFormat([file("p1.jpg"),file("p2.png")])).toBe("photo"));
  it.each([["a.xlsx","b.pdf"],["a.pdf","b.pdf"],["a.xml","b.jpg"],["a.xlsx","b.xlsx"]])("recusa arquivos misturados: %s + %s", (a,b) => expect(() => detectImportFormat([file(a),file(b)])).toThrow(/por vez/));
  it("recusa vazio, formato desconhecido e limites antes da leitura", () => {
    expect(() => detectImportFormat([file("a.xlsx",4*1024*1024+1)])).toThrow(/4 MB/);
    expect(() => detectImportFormat([])).toThrow(/Selecione/);
    expect(() => detectImportFormat([file("a.pdf",0)])).toThrow(/vazio/);
    expect(() => detectImportFormat([file("a.csv")])).toThrow(/Formato/);
    expect(() => detectImportFormat([file("a.pdf",10*1024*1024+1)])).toThrow(/10 MB/);
    expect(() => detectImportFormat(Array.from({length:11},(_,i)=>file(i+".jpg")))).toThrow(/10 fotos/);
    expect(() => detectImportFormat([file("a.jpg",10*1024*1024),file("b.jpg",10*1024*1024),file("c.jpg",6*1024*1024)])).toThrow(/25 MB/);
  });
});
function workbookFile(rows: Record<string, unknown>[]) {
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Planilha");
  return new File([XLSX.write(wb,{type:"array",bookType:"xlsx"})],"entrada.xlsx");
}
function sampleRow() {
  const wb=XLSX.read(generateTemplateBuffer(),{type:"buffer"});
  return XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]])[0];
}
describe("prévia de XLSX sem gravação", () => {
  it("extrai produtos e soma peças por nota/fornecedor", async () => {
    const row=sampleRow();
    const result=await previewSpreadsheet(workbookFile([{...row,QUANT:4},{...row,SKU:"OUTRO-M",Tamanho:"M",QUANT:3}]));
    expect(result).toMatchObject({canImport:true,totalUnits:7,invoices:1,totalRows:2,errors:[]});
    expect(result.rows[0]).toMatchObject({sku:"CJ-SHORT-CAMILA-TERRA-P",colorName:"TERRA",sizeName:"P",commercialValue:179,quantity:4});
  });
  it("mantém prévia parcial mas bloqueia confirmação se uma linha é inválida", async () => {
    const row=sampleRow();
    const result=await previewSpreadsheet(workbookFile([row,{...row,SKU:"",QUANT:2}]));
    expect(result.rows).toHaveLength(1); expect(result.canImport).toBe(false); expect(result.errors[0].line).toBe(3);
  });
  it("mostra erro de cabeçalho sem permitir importação", async () => {
    const result=await previewSpreadsheet(workbookFile([{SKU:"X",QUANT:1}]));
    expect(result.canImport).toBe(false);expect(result.errors[0].message).toMatch(/Cabeçalho/);
  });
  it("recusa PDF renomeado como planilha e arquivo vazio", async () => {
    await expect(previewSpreadsheet(new File(["%PDF-1.7"],"nota.xlsx"))).rejects.toThrow(/não é uma planilha/);
    await expect(previewSpreadsheet(new File([],"nota.xlsx"))).rejects.toThrow(/vazio/);
  });
  it("bloqueia mais de 200 linhas da mesma nota", async () => {
    const row=sampleRow();
    const result=await previewSpreadsheet(workbookFile(Array.from({length:201},(_,i)=>({...row,SKU:"SKU-"+i}))));
    expect(result.canImport).toBe(false);expect(result.errors.some(e=>e.message.includes("200 linhas"))).toBe(true);
  });
});
