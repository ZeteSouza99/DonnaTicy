import { describe, expect, it } from "vitest";
import { parseDanfeText, pdfTextLines, validAccessKey, validateInvoiceDocument, validateReceiptReview } from "../src/lib/import/invoice-document";
import { invoiceFixture, danfeFixture } from "./fixtures/invoice-document";

describe("leitura e conferência da nota", () => {
  const metadata = {source: "pdf" as const, fileName: "teste.pdf", fileHash: "b".repeat(64)};
  it("reconhece 22 itens em duas páginas e mantém os totais e códigos", () => {
    const doc = parseDanfeText(danfeFixture().text, metadata);
    expect(doc.items).toHaveLength(22);
    expect(doc.items[0].code).toBe("01");
    expect(doc.items.reduce((sum,i)=>sum+i.quantity,0)).toBe(130);
    expect(doc.productsTotal).toBe(4390.5);
    expect(doc.freight).toBe(355.76);
    expect(doc.invoiceTotal).toBe(4746.26);
  });
  it("recusa página faltando, leitura repetida e custo inconsistente", () => {
    const sample = danfeFixture();
    expect(()=>parseDanfeText(sample.text.split("PÁGINA 2")[0],metadata)).toThrow(/soma/);
    expect(()=>parseDanfeText(sample.text + "\n" + sample.rows[0],metadata)).toThrow(/soma/);
    expect(()=>validateInvoiceDocument({...invoiceFixture(), items:[{...invoiceFixture().items[0],unitPrice:24}]})).toThrow(/custo/);
  });
  it("ignora bordas reconhecidas como separadores sem adivinhar códigos do OCR",()=>{
    const sample=danfeFixture();
    const scanned=sample.text.replace(/62046900 0102 6101 PÇ/g,"62046900 [0102 |6101 | PÇ").replace("01 PRODUTO", "ol PRODUTO");
    const doc=parseDanfeText(scanned,{...metadata,source:"ocr"});
    expect(doc.items).toHaveLength(22);expect(doc.items[0].code).toBe("ol");
    expect(doc.invoiceTotal).toBe(4746.26);
    expect(()=>parseDanfeText(scanned.replace(/62046900/g,"ilegível"),{...metadata,source:"ocr"})).toThrow(/tabela de produtos/);
  });
  it("aceita correções explícitas de códigos e recusa duplicidade ambígua",()=>{
    const doc=invoiceFixture();
    doc.items.push({...doc.items[0],line:2,description:"Outro produto"});
    const review={locationId:"L",collectionId:"C",lineId:"L",confirmed:true,items:doc.items.map(i=>({line:i.line,categoryId:"C",salePrice:50,allocations:[{quantity:4,color:"Preto",size:"M"}]}))};
    expect(()=>validateReceiptReview(doc,review)).toThrow(/código do fornecedor repetido/);
    expect(validateReceiptReview(doc,{...review,items:review.items.map(i=>({...i,code:String(i.line),description:"Conferida "+i.line}))}).items[1].code).toBe("2");
  });
  it("recusa chave inválida, identidade divergente e quantidades sem conversão", () => {
    const doc=invoiceFixture();
    expect(validAccessKey(doc.accessKey)).toBe(true);
    expect(()=>validateInvoiceDocument({...doc,accessKey:doc.accessKey.slice(0,-1)+(doc.accessKey.endsWith("0")?"1":"0")})).toThrow(/Chave/);
    expect(()=>validateInvoiceDocument({...doc,number:"53"})).toThrow(/correspondem/);
    expect(()=>validateInvoiceDocument({...doc,items:[{...doc.items[0],quantity:1.5}]})).toThrow(/fracionada/);
    expect(()=>validateInvoiceDocument({...doc,items:[{...doc.items[0],unit:"CX"}]})).toThrow(/conversão/);
    expect(()=>validateInvoiceDocument({...doc,items:[{...doc.items[0],line:2}]})).toThrow(/sequência/);
  });
  it("exige distribuição completa, categoria e preço para novos produtos", () => {
    const doc=invoiceFixture();
    const review={locationId:"L",collectionId:"C",lineId:"L",confirmed:true,items:[{line:1,categoryId:"C",salePrice:50,allocations:[{quantity:2,color:"Preto",size:"M"},{quantity:2,color:"Azul",size:"G"}]}]};
    expect(validateReceiptReview(doc,review).items[0].allocations).toHaveLength(2);
    expect(()=>validateReceiptReview(doc,{...review,items:[{...review.items[0],allocations:[review.items[0].allocations[0]]}]})).toThrow(/somar 4/);
    expect(()=>validateReceiptReview(doc,{...review,items:[{...review.items[0],salePrice:0}]})).toThrow(/preço/);
    expect(()=>validateReceiptReview(doc,{...review,confirmed:false})).toThrow();
    expect(validateReceiptReview(doc,{...review,items:[{line:1,salePrice:0,allocations:[{quantity:4,variantId:"exists"}]}]}).items[0].categoryId).toBe("");
  });
  it("recompõe linhas de texto pela posição dos campos no PDF", () => {
    expect(pdfTextLines([{str:"30,00",x:300,y:10},{str:"Cabeçalho",x:0,y:20},{str:"01",x:0,y:10.5},{str:"Produto",x:50,y:10}])).toBe("Cabeçalho\n01 Produto 30,00");
  });
});
