import { detectImportFormat } from "./import-files";
import { parseDanfeText, pdfTextLines, validateInvoiceDocument, type InvoiceDocument } from "./invoice-document";

type Metadata = Pick<InvoiceDocument,"fileName"|"fileHash"|"source">;

export function xmlItemNumber(attribute: string | null, fields: string[]): number {
  const values = attribute === null ? fields : [attribute, ...fields];
  if (fields.length > 1 || !values.length || values.some(v => !/^\d+$/.test(v) || Number(v) <= 0 || Number(v) !== Number(values[0]))) {
    throw new Error("XML: numeração de item ausente, inválida ou divergente.");
  }
  return Number(values[0]);
}

/** XML é lido no navegador; DTD e entidades externas são recusados antes do DOMParser. */
export function parseInvoiceXml(xml: string, metadata: Metadata): InvoiceDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML com DTD ou entidades externas não é aceito.");
  const root = new DOMParser().parseFromString(xml, "application/xml");
  if (root.getElementsByTagName("parsererror").length) throw new Error("XML inválido.");
  const all = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS("*",name));
  const one = (node: Document | Element, name: string) => {
    const values = all(node,name);
    if (values.length !== 1) throw new Error(`XML: campo ${name} ausente ou repetido.`);
    return values[0];
  };
  const value = (node: Document | Element, name: string) => one(node,name).textContent?.trim() ?? "";
  const numeric = (node: Element, name: string, optional = false) => {
    if (optional && !all(node,name).length) return 0;
    const v=value(node,name);
    if (!/^\d+(\.\d+)?$/.test(v)) throw new Error(`XML: valor inválido em ${name}.`);
    return Number(v);
  };
  const info = one(root,"infNFe"), ide = one(info,"ide"), issuer = one(info,"emit");
  if (value(ide,"mod")!=="55" || value(ide,"tpNF")!=="1" || value(ide,"tpAmb")!=="1") throw new Error("Envie uma NF-e de saída do fornecedor, modelo 55, emitida em produção.");
  const protocol = one(root,"protNFe");
  if (!["100","150"].includes(value(protocol,"cStat"))) throw new Error("O XML não informa autorização de uso da NF-e.");
  const key = (info.getAttribute("Id") ?? "").replace(/^NFe/,"");
  if (value(protocol,"chNFe")!==key) throw new Error("A chave do protocolo difere da nota.");
  const total = one(one(info,"total"),"ICMSTot");
  const date = all(ide,"dhEmi").length ? value(ide,"dhEmi") : value(ide,"dEmi");
  const items = all(info,"det").map(det=> {
    const p=one(det,"prod"), ean=all(p,"cEAN")[0]?.textContent?.trim() ?? "";
    const fields = Array.from(det.children).filter(child => child.localName === "nItem").map(child => child.textContent?.trim() ?? "");
    const line = xmlItemNumber(det.getAttribute("nItem"), fields);
    return {line,code:value(p,"cProd"),description:value(p,"xProd"),ncm:value(p,"NCM"),unit:value(p,"uCom"),quantity:numeric(p,"qCom"),unitPrice:numeric(p,"vUnCom"),total:numeric(p,"vProd"),barcode:/^\d{8,14}$/.test(ean)?ean:""};
  });
  return validateInvoiceDocument({...metadata,source:"xml",accessKey:key,number:value(ide,"nNF"),series:value(ide,"serie"),supplierName:value(issuer,"xNome"),supplierDocument:value(issuer,"CNPJ"),issueDate:date.slice(0,10),productsTotal:numeric(total,"vProd"),freight:numeric(total,"vFrete"),discount:numeric(total,"vDesc",true),invoiceTotal:numeric(total,"vNF"),items});
}

interface PdfPage {
  getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
  getViewport(options:{scale:number}): {width:number;height:number};
  render(options:{canvasContext:CanvasRenderingContext2D;viewport:{width:number;height:number}}): {promise:Promise<void>};
  cleanup(): void;
}
interface ReaderRuntime {
  openPdf(data: ArrayBuffer): Promise<{numPages:number;getPage(n:number):Promise<PdfPage>;destroy():Promise<void>}>;
  recognize(image: Blob | HTMLCanvasElement, progress:(value:string)=>void):Promise<string>;
}
declare global { interface Window { donnaInvoiceReaders?: ReaderRuntime } }
let runtimePromise: Promise<ReaderRuntime> | undefined;
function runtime(): Promise<ReaderRuntime> {
  if (window.donnaInvoiceReaders) return Promise.resolve(window.donnaInvoiceReaders);
  return runtimePromise ??= new Promise<ReaderRuntime>((resolve,reject)=>{
    const script=document.createElement("script"); script.type="module"; script.src="/invoice-reader.mjs";
    const fail=()=>{script.remove();runtimePromise=undefined;reject(new Error("Leitura de PDF e foto indisponível nesta instalação. Use o XML ou solicite a ativação dos leitores."));};
    script.onload=()=>window.donnaInvoiceReaders?resolve(window.donnaInvoiceReaders):fail();script.onerror=fail;
    document.head.appendChild(script);
  });
}

export async function readInvoiceFiles(files: File[], progress:(value:string)=>void): Promise<InvoiceDocument> {
  const format=detectImportFormat(files);
  if(format==="xlsx") throw new Error("Use a leitura de planilha para arquivos XLSX.");
  const types=files.map(f=>f.name.toLowerCase().split(".").at(-1));
  const bytes=await Promise.all(files.map(f=>f.arrayBuffer()));
  const joined=new Uint8Array(bytes.reduce((n,b)=>n+b.byteLength,0));let offset=0;
  for(const b of bytes){joined.set(new Uint8Array(b),offset);offset+=b.byteLength;}
  const fileHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",joined))).map(v=>v.toString(16).padStart(2,"0")).join("");
  const metadata: Metadata={fileName:files.map(f=>f.name).join(", ").slice(0,200),fileHash,source:"pdf"};
  if(types[0]==="xml") return parseInvoiceXml(new TextDecoder().decode(bytes[0]),metadata);
  if(types.some(t=>!["pdf","jpg","jpeg","png","webp"].includes(t??""))) throw new Error("Selecione XML, PDF, JPG, PNG ou WebP.");
  const reader=await runtime(); const pages:string[]=[];
  if(types[0]==="pdf") {
    if(new TextDecoder().decode(bytes[0].slice(0,5))!=="%PDF-") throw new Error("O arquivo não é um PDF válido.");
    const pdf=await reader.openPdf(bytes[0]);
    try {
      if(pdf.numPages>10) throw new Error("Envie notas com até 10 páginas.");
      for(let n=1;n<=pdf.numPages;n++) {
        progress(`Lendo página ${n} de ${pdf.numPages}…`);
        const page=await pdf.getPage(n);const text=await page.getTextContent();
        let content=pdfTextLines(text.items.filter(i=>typeof i.str==="string" && i.transform).map(i=>({str:i.str!,x:i.transform![4],y:i.transform![5]})));
        if(content.replace(/\s/g,"").length<100) {
          metadata.source="ocr";const base=page.getViewport({scale:1});
          const viewport=page.getViewport({scale:Math.min(2.5,Math.sqrt(12_000_000/(base.width*base.height)))});
          const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const ctx=canvas.getContext("2d");if(!ctx) throw new Error("Não foi possível preparar a página para leitura.");
          try{await page.render({canvasContext:ctx,viewport}).promise;content=await reader.recognize(canvas,progress);}finally{canvas.width=0;canvas.height=0;}
        }
        pages.push(content);page.cleanup();
      }
    } finally {await pdf.destroy();}
  } else {
    metadata.source="ocr";
    for(const file of files) {
      const bitmap=await createImageBitmap(file);
      try{if(bitmap.width*bitmap.height>25_000_000)throw new Error("A foto é muito grande. Reduza para até 25 megapixels.");}finally{bitmap.close();}
      progress(`Lendo ${file.name}…`);pages.push(await reader.recognize(file,progress));
    }
  }
  return parseDanfeText(pages.join("\n"),metadata);
}
