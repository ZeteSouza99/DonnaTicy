import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { createInvoiceDraft, confirmInvoiceReceipt, getInvoiceDraft, saveInvoiceReview } from "@/services/invoice-receipt-service";
import { advanceImportJob, getImportJob } from "@/services/import-job-service";
import { POST as createDraft } from "@/app/api/imports/invoices/route";
import { POST as confirmDraft } from "@/app/api/imports/invoices/[id]/route";
import { invoiceFixture } from "../fixtures/invoice-document";
import { createFixture, resetDatabase, request, params } from "./fixtures";

let fixture: Awaited<ReturnType<typeof createFixture>>;
beforeEach(async()=>{await resetDatabase();fixture=await createFixture();});
function review() {
  return {locationId:fixture.location.id,collectionId:fixture.product.collectionId,lineId:fixture.product.lineId,confirmed:true,items:[{line:1,categoryId:fixture.product.categoryId,salePrice:70,allocations:[{quantity:2,variantId:fixture.variant.id,color:"",size:""},{quantity:2,color:"Azul",size:"G"}]}]};
}

describe("entrada de NF-e atômica",()=>{
  it("recebe as caixas de chá inteiras e divide o display XPLOD em flaconetes mantendo o total fiscal", async () => {
    const doc = invoiceFixture();
    const base = doc.items[0];
    doc.items = [
      {...base, description:"CHÁ MISTO", unit:"CX", quantity:2, unitPrice:5.68, total:11.36},
      {...base, line:2, code:"002", description:"ENERGETICO XPLOD DISPLAY COM 24 FLACONETES", unit:"UN", quantity:1, unitPrice:40.25, total:40.25},
    ];
    doc.productsTotal = doc.invoiceTotal = 51.61;
    doc.freight = 0;
    const job = await createInvoiceDraft(fixture.user.id, doc);
    const input = {...review(), items: [2,24].map((quantity, i) => ({
      line:i+1, categoryId:fixture.product.categoryId, salePrice:10, allocations:[{quantity,color:"Única",size:"U"}],
    }))};
    const display = input.items[1].allocations[0];
    display.quantity = 1;
    await expect(confirmInvoiceReceipt(job.id,fixture.user.id,input)).rejects.toThrow(/somar 24/);
    display.quantity = 24;
    expect(await confirmInvoiceReceipt(job.id,fixture.user.id,input)).toMatchObject({totalUnits:26});
    expect(await confirmInvoiceReceipt(job.id,fixture.user.id,input)).toMatchObject({totalUnits:26});
    const rows = await prisma.invoiceItem.findMany({orderBy:{quantity:"asc"}});
    expect(rows.map(r=>[r.unit,r.quantity,Number(r.totalPrice)])).toEqual([["CX",2,11.36],["UN",24,40.25]]);
    expect(Number(rows[1].unitPrice)).toBeCloseTo(40.25/24,4);
    expect((await prisma.stockMovement.aggregate({_sum:{quantity:true}}))._sum.quantity).toBe(26);
    expect((await getInvoiceDraft(job.id,fixture.user.id)).document.items[1].quantity).toBe(1);
  });
  it("usa a correção conferida e preserva a leitura original no histórico",async()=>{
    const doc={...invoiceFixture(),source:"ocr" as const};
    const job=await createInvoiceDraft(fixture.user.id,doc);
    const input=review();
    const corrected={...input,items:input.items.map(i=>({...i,code:"COD-CORRETO",description:"Descrição conferida"}))};
    await saveInvoiceReview(job.id,fixture.user.id,corrected);
    await confirmInvoiceReceipt(job.id,fixture.user.id,corrected);
    const added=await prisma.product.findFirstOrThrow({where:{id:{not:fixture.product.id}}});
    expect(added.name).toBe("Descrição conferida");
    const saved=await getInvoiceDraft(job.id,fixture.user.id);
    expect(saved.document.items[0].description).toBe("Produto Teste");
    expect(saved.review?.items[0].code).toBe("COD-CORRETO");
  });
  it("leitura e conferência salva não alteram estoque nem criam nota",async()=>{
    const first=await createInvoiceDraft(fixture.user.id,invoiceFixture());
    expect((await createInvoiceDraft(fixture.user.id,invoiceFixture())).id).toBe(first.id);
    const partial={...review(),collectionId:"",items:[{line:1,categoryId:"",salePrice:0,allocations:[{quantity:4,color:"",size:""}]}]};
    await saveInvoiceReview(first.id,fixture.user.id,partial);
    expect((await getInvoiceDraft(first.id,fixture.user.id)).review?.collectionId).toBe("");
    await expect(confirmInvoiceReceipt(first.id,fixture.user.id,partial)).rejects.toThrow();
    await saveInvoiceReview(first.id,fixture.user.id,review());
    expect((await getInvoiceDraft(first.id,fixture.user.id)).review?.items).toHaveLength(1);
    expect(await prisma.invoice.count()).toBe(0);
    expect((await prisma.stockPosition.findFirstOrThrow()).quantity).toBe(10);
    await expect(getImportJob(first.id,fixture.user.id)).rejects.toThrow();
    await expect(advanceImportJob(first.id,fixture.user.id)).rejects.toThrow();
  });
  it("cria produtos e variantes, preserva preços existentes e confirma uma única vez",async()=>{
    const job=await createInvoiceDraft(fixture.user.id,invoiceFixture());
    const results=await Promise.all([confirmInvoiceReceipt(job.id,fixture.user.id,review()),confirmInvoiceReceipt(job.id,fixture.user.id,review())]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0]).toMatchObject({totalUnits:4,productsCreated:1,variantsCreated:1});
    expect(await prisma.invoice.count()).toBe(1);
    expect(await prisma.invoiceItem.count()).toBe(2);
    expect(await prisma.stockMovement.count()).toBe(2);
    expect(await prisma.financialEntry.count()).toBe(0);
    const old=await prisma.product.findUniqueOrThrow({where:{id:fixture.product.id}});
    expect(Number(old.basePrice)).toBe(100);expect(Number(old.costPrice)).toBe(40);
    expect((await prisma.stockPosition.findUniqueOrThrow({where:{variantId_locationId:{variantId:fixture.variant.id,locationId:fixture.location.id}}})).quantity).toBe(12);
    const added=await prisma.product.findFirstOrThrow({where:{id:{not:old.id}}});
    expect(Number(added.basePrice)).toBe(70);expect(Number(added.costPrice)).toBe(27.5);
    expect((await prisma.stockPosition.aggregate({_sum:{quantity:true}}))._sum.quantity).toBe(14);
  });
  it("a mesma chave em dois arquivos concorrentes gera somente uma entrada",async()=>{
    const first=await createInvoiceDraft(fixture.user.id,invoiceFixture());
    const second=await createInvoiceDraft(fixture.user.id,{...invoiceFixture(),source:"pdf",fileName:"outra.pdf",fileHash:"b".repeat(64)});
    const results=await Promise.allSettled([confirmInvoiceReceipt(first.id,fixture.user.id,review()),confirmInvoiceReceipt(second.id,fixture.user.id,review())]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(await prisma.invoice.count()).toBe(1);
    expect((await prisma.stockPosition.aggregate({_sum:{quantity:true}}))._sum.quantity).toBe(14);
  });
  it("falha depois de cadastrar um item desfaz nota, fornecedor, produtos e estoque",async()=>{
    const doc=invoiceFixture();
    doc.items.push({...doc.items[0],line:2,code:"002",description:"Outro produto"});doc.productsTotal=200;doc.invoiceTotal=210;
    const job=await createInvoiceDraft(fixture.user.id,doc);
    const input=review();input.items.push({...input.items[0],line:2,allocations:[{quantity:4,variantId:"missing",color:"",size:""}]});
    await expect(confirmInvoiceReceipt(job.id,fixture.user.id,input)).rejects.toThrow(/indisponível/);
    expect(await prisma.invoice.count()).toBe(0);expect(await prisma.supplier.count()).toBe(0);
    expect(await prisma.product.count()).toBe(1);expect(await prisma.stockMovement.count()).toBe(0);
    expect((await prisma.stockPosition.findFirstOrThrow()).quantity).toBe(10);
    expect((await getInvoiceDraft(job.id,fixture.user.id)).status).toBe("REVIEW");
  });
  it("recusa quantidade alterada e notas anteriores com zeros à esquerda",async()=>{
    const doc=invoiceFixture();const job=await createInvoiceDraft(fixture.user.id,doc);
    const bad=review();bad.items[0].allocations[0].quantity=3;
    await expect(confirmInvoiceReceipt(job.id,fixture.user.id,bad)).rejects.toThrow(/somar/);
    const old=await prisma.invoice.create({data:{number:"000000052",supplierName:doc.supplierName,issueDate:new Date(),productsTotal:100,invoiceTotal:100}});
    await prisma.invoiceItem.create({data:{invoiceId:old.id,variantId:fixture.variant.id,sku:fixture.variant.sku,description:"Teste",unit:"UN",quantity:4,unitPrice:25,totalPrice:100}});
    await expect(confirmInvoiceReceipt(job.id,fixture.user.id,review())).rejects.toThrow(/Já existe/);
    expect(await prisma.stockMovement.count()).toBe(0);
  });
  it("API recusa usuário sem permissão e conferência de outro usuário",async()=>{
    const doc=invoiceFixture();const job=await createInvoiceDraft(fixture.user.id,doc);
    await expect(getInvoiceDraft(job.id,"other-user")).rejects.toThrow();
    await expect(confirmInvoiceReceipt(job.id,"other-user",review())).rejects.toThrow();
    await prisma.user.update({where:{id:fixture.user.id},data:{role:"VIEWER"}});
    const token=await signToken({sub:fixture.user.id,email:fixture.user.email,role:"VIEWER",locationId:fixture.location.id,tokenVersion:fixture.user.tokenVersion});
    expect((await createDraft(request("POST","/api/imports/invoices",token,doc))).status).toBe(403);
    expect((await confirmDraft(request("POST",`/api/imports/invoices/${job.id}`,token,review()),params(job.id))).status).toBe(403);
    expect(await prisma.invoice.count()).toBe(0);
  });
  it("planilha não reimporta uma nota já recebida por documento",async()=>{
    const doc=invoiceFixture();const first=await createInvoiceDraft(fixture.user.id,doc);
    await confirmInvoiceReceipt(first.id,fixture.user.id,review());
    const row={invoiceNumber:"000000052",invoiceDate:"2026-10-08T12:00:00.000Z",supplierName:doc.supplierName,freight:10,productsTotal:100,invoiceTotal:110,invoiceDescription:"Teste",internalName:"Produto Teste",sku:"IMPORT-01",colorName:"Preto",sizeName:"M",categoryName:"Teste",unit:"UN",quantity:4,unitPrice:25,totalPrice:100,realCost:27.5,margin:60,costMargin:40,commercialValue:70,discount:0,icmsBase:0,icmsValue:0,ipiValue:0,icmsRate:0,ipiRate:0};
    const summary={invoicesProcessed:0,invoicesCreated:0,invoicesUpdated:0,productsCreated:0,productsUpdated:0,variantsCreated:0,variantsUpdated:0,stockEntered:0,totalUnits:0,errors:[]};
    const job=await prisma.importJob.create({data:{userId:fixture.user.id,fileName:"Repetida.xlsx",fileHash:"sheet",dryRun:false,rows:[row],total:1,summary,parseErrors:[]}});
    const result=await advanceImportJob(job.id,fixture.user.id);
    expect(result.status).toBe("FAILED");expect(result.error).toMatch(/já foi importada/);
    expect(await prisma.invoice.count()).toBe(1);
    expect((await prisma.stockPosition.aggregate({_sum:{quantity:true}}))._sum.quantity).toBe(14);
  });
});
