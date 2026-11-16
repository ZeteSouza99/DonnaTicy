import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createAuditLogTx } from "@/lib/audit";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { allocateCents } from "@/lib/allocations";
import { lockStockPositions } from "./stock-lock";
import { validateInvoiceDocument, validateReceiptReview, validateReceiptDraft, type InvoiceDocument, type ReceiptReview } from "@/lib/import/invoice-document";

const PREFIX="document:";
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase();
const summaryFields={id:true,fileName:true,status:true,summary:true,createdAt:true,error:true} as const;
function invalid(error:unknown):never {throw new ValidationError(error instanceof Error?error.message:"Confira os dados da nota.");}
function documentFrom(input:unknown){try{return validateInvoiceDocument(input);}catch(e){return invalid(e);}}

/** Compartilhado com planilhas: protege contra notas antigas sem chave de acesso registrada. */
export async function findExistingReceipt(tx:Prisma.TransactionClient, number:string, supplierName:string, supplierId?:string) {
 const normalized=String(Number(number.replace(/\D/g,"")));
 const invoices=await tx.invoice.findMany({where:{OR:[{supplierName:{equals:supplierName,mode:"insensitive"}},...(supplierId?[{supplierId}]:[])]},select:{id:true,number:true,series:true,_count:{select:{items:true}}}});
 return invoices.find(i=>String(Number(i.number.replace(/\D/g,"")))===normalized && i._count.items>0);
}

export async function createInvoiceDraft(userId:string,input:unknown) {
 const doc=documentFrom(input);
 const existing=await prisma.importJob.findUnique({where:{userId_fileHash_dryRun:{userId,fileHash:PREFIX+doc.fileHash,dryRun:false}},select:{id:true}});
 if(existing)return getInvoiceDraft(existing.id,userId);
 const summary={invoicesProcessed:0,invoicesCreated:0,invoicesUpdated:0,productsCreated:0,productsUpdated:0,variantsCreated:0,variantsUpdated:0,stockEntered:0,totalUnits:0,errors:[]};
 const job=await prisma.importJob.upsert({where:{userId_fileHash_dryRun:{userId,fileHash:PREFIX+doc.fileHash,dryRun:false}},update:{},create:{userId,fileHash:PREFIX+doc.fileHash,fileName:doc.fileName,dryRun:false,status:"REVIEW",total:doc.items.length,rows:JSON.parse(JSON.stringify({document:doc})),summary,parseErrors:[]}});
 return getInvoiceDraft(job.id,userId);
}
export async function getInvoiceDraft(id:string,userId:string) {
 const job=await prisma.importJob.findFirst({where:{id,userId,fileHash:{startsWith:PREFIX}}});
 if(!job)throw new NotFoundError("Conferência");
 return {id:job.id,status:job.status,fileName:job.fileName,...(job.rows as unknown as {document:InvoiceDocument;review?:ReceiptReview}),summary:job.summary};
}
export async function invoiceReceiptOptions(userId:string) {
 const [locations,collections,lines,categories,history]=await Promise.all([
  prisma.location.findMany({where:{isActive:true,deletedAt:null},select:{id:true,name:true},orderBy:{name:"asc"}}),
  prisma.collection.findMany({where:{isActive:true,deletedAt:null},select:{id:true,name:true},orderBy:{name:"asc"}}),
  prisma.line.findMany({where:{isActive:true,deletedAt:null},select:{id:true,name:true},orderBy:{name:"asc"}}),
  prisma.category.findMany({where:{isActive:true,deletedAt:null},select:{id:true,name:true},orderBy:{name:"asc"}}),
  prisma.importJob.findMany({where:{userId,fileHash:{startsWith:PREFIX}},select:summaryFields,orderBy:{createdAt:"desc"},take:20}),
 ]);
 return {locations,collections,lines,categories,history};
}

export async function saveInvoiceReview(id:string,userId:string,review:unknown) {
 const draft=await getInvoiceDraft(id,userId);
 let parsed:ReceiptReview;try{parsed=validateReceiptDraft(draft.document,review);}catch(e){return invalid(e);}
 const updated=await prisma.importJob.updateMany({where:{id,userId,status:"REVIEW",fileHash:{startsWith:PREFIX}},data:{rows:JSON.parse(JSON.stringify({document:draft.document,review:parsed}))}});
 if(!updated.count)throw new ConflictError("Esta nota já foi confirmada. Atualize a página.");
 return getInvoiceDraft(id,userId);
}

/** Nota, itens, novos cadastros, movimentos e confirmação são atômicos. */
export async function confirmInvoiceReceipt(id:string,userId:string,input:unknown) {
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM import_jobs WHERE id=${id} AND user_id=${userId} FOR UPDATE`;
  const job=await tx.importJob.findFirst({where:{id,userId,fileHash:{startsWith:PREFIX}}});
  if(!job)throw new NotFoundError("Conferência");
  if(job.status==="COMPLETED")return job.summary;
  if(job.status!=="REVIEW")throw new ConflictError("Conferência não está disponível para confirmação.");
  const doc=documentFrom((job.rows as unknown as {document:unknown}).document);
  let review:ReceiptReview;try{review=validateReceiptReview(doc,input);}catch(e){return invalid(e);}
  // A mesma trava também é usada pela importação XLSX.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended('invoice-receipts',0))`;
  const identity=`invoice-receipt:${doc.accessKey}`;
  if(await tx.operationRequest.findUnique({where:{key:identity}}))throw new ConflictError("Esta NF-e já foi importada. O estoque não foi alterado.");
  const supplier=await tx.supplier.findUnique({where:{cnpj:doc.supplierDocument}});
  if(supplier && (supplier.deletedAt || !supplier.isActive))throw new ConflictError("Fornecedor inativo. Revise o cadastro antes de importar.");
  if(await findExistingReceipt(tx,doc.number,doc.supplierName,supplier?.id))throw new ConflictError("Já existe uma entrada dessa nota para o fornecedor. Confira o histórico; nenhuma quantidade foi adicionada.");
  const [location,collection,line]=await Promise.all([
   tx.location.findFirst({where:{id:review.locationId,isActive:true,deletedAt:null}}),
   tx.collection.findFirst({where:{id:review.collectionId,isActive:true,deletedAt:null}}),
   tx.line.findFirst({where:{id:review.lineId,isActive:true,deletedAt:null}}),
  ]);
  if(!location || !collection || !line)throw new ValidationError("Escolha local, coleção e linha ativos.");
  const supplierRecord=supplier ?? await tx.supplier.create({data:{companyName:doc.supplierName,cnpj:doc.supplierDocument,type:"FULL_PACKAGE"}});
  // Não preenche nem altera lançamentos manuais anteriores: evita duplicar contas a pagar.
  const headerCollision=await tx.invoice.findUnique({where:{number_supplierName:{number:doc.number,supplierName:doc.supplierName}}});
  if(headerCollision)throw new ConflictError("Já existe uma entrada com esse número e fornecedor. Concilie a entrada existente antes de importar.");
  const invoice=await tx.invoice.create({data:{number:doc.number,series:doc.series,supplierId:supplierRecord.id,supplierName:doc.supplierName,issueDate:new Date(`${doc.issueDate}T12:00:00Z`),productsTotal:doc.productsTotal,freight:doc.freight,discountTotal:doc.discount,invoiceTotal:doc.invoiceTotal,description:`NF-e ${doc.number}, série ${doc.series}`}});
  const costs=allocateCents(Math.round(doc.invoiceTotal*100),doc.items.map(i=>Math.round(i.total*100)));
  const totals={invoiceId:invoice.id,invoicesProcessed:1,invoicesCreated:1,productsCreated:0,variantsCreated:0,totalUnits:0,stockEntered:0};
  const receipts:Array<{variantId:string;quantity:number;line:number;sku:string;description:string;ncm:string;unit:string;unitPrice:number;totalPrice:number;realCost:number;commercialValue:number}>=[];
  for(const original of doc.items){
   const checked=review.items.find(i=>i.line===original.line)!;
   const item={...original,code:checked.code??original.code,description:checked.description??original.description};
   const splitTotals=allocateCents(Math.round(item.total*100),checked.allocations.map(a=>a.quantity));
   const unitCost=costs[item.line-1]/100/item.quantity;
   for(const [index,allocation]of checked.allocations.entries()){
    let variant;
    if(allocation.variantId){
     variant=await tx.productVariant.findFirst({where:{id:allocation.variantId,isActive:true,deletedAt:null,product:{isActive:true,deletedAt:null}},include:{product:true}});
     if(!variant)throw new ValidationError(`Item ${item.line}: variante indisponível.`);
    }else{
     const category=await tx.category.findFirst({where:{id:checked.categoryId,isActive:true,deletedAt:null}});
     if(!category)throw new ValidationError(`Item ${item.line}: escolha uma categoria ativa.`);
     const colorName=normalize(allocation.color),sizeName=normalize(allocation.size);
     let color=await tx.color.findFirst({where:{name:{equals:colorName,mode:"insensitive"},isActive:true}});
     if(!color)color=await tx.color.create({data:{name:colorName,code:`NF-${digest(colorName).slice(0,20)}`,hexValue:"#9CA3AF"}});
     let size=await tx.size.findFirst({where:{name:{equals:sizeName,mode:"insensitive"},isActive:true}});
     if(!size)size=await tx.size.create({data:{name:sizeName,code:`N${digest(sizeName).slice(0,9)}`,sortOrder:99}});
     const productCode=`NF-${digest(`${doc.supplierDocument}:${item.code}`).slice(0,28)}`;
     let product=await tx.product.findUnique({where:{code:productCode}});
     if(product && (product.deletedAt || !product.isActive || normalize(product.name)!==normalize(item.description)))throw new ConflictError(`Item ${item.line}: código do fornecedor vinculado a outro cadastro. Selecione a variante existente.`);
     if(!product){product=await tx.product.create({data:{code:productCode,name:item.description,collectionId:collection.id,lineId:line.id,categoryId:category.id,technology:[],costPrice:unitCost,basePrice:checked.salePrice,markup:unitCost>0?checked.salePrice/unitCost:1}});totals.productsCreated++;}
     const existing=await tx.productVariant.findUnique({where:{productId_colorId_sizeId:{productId:product.id,colorId:color.id,sizeId:size.id}},include:{product:true}});
     if(existing && (!existing.isActive || existing.deletedAt))throw new ConflictError(`Item ${item.line}: a variante está inativa.`);
     variant=existing ?? await tx.productVariant.create({data:{productId:product.id,colorId:color.id,sizeId:size.id,sku:`NF-${digest(`${product.id}:${color.id}:${size.id}`).slice(0,28)}`,ncm:item.ncm||null},include:{product:true}});
     if(!existing)totals.variantsCreated++;
    }
    receipts.push({variantId:variant.id,quantity:allocation.quantity,line:item.line,sku:variant.sku,description:item.description,ncm:item.ncm,unit:item.unit,unitPrice:item.unitPrice,totalPrice:splitTotals[index]/100,realCost:unitCost,commercialValue:Number(variant.product.basePrice)});
   }
  }
  await lockStockPositions(tx,receipts.map(r=>({variantId:r.variantId,locationId:location.id})));
  for(const r of receipts){
   await tx.stockPosition.upsert({where:{variantId_locationId:{variantId:r.variantId,locationId:location.id}},create:{variantId:r.variantId,locationId:location.id,quantity:r.quantity},update:{quantity:{increment:r.quantity}}});
   await tx.stockMovement.create({data:{variantId:r.variantId,toLocationId:location.id,quantity:r.quantity,reason:"PURCHASE_RECEIVED",referenceType:"INVOICE",referenceId:invoice.id,notes:`NF ${doc.number}, item ${r.line}`}});
   const {line:sourceLine,...invoiceItem}=r;
   await tx.invoiceItem.create({data:{...invoiceItem,invoiceId:invoice.id,description:`${r.description} (item ${sourceLine})`}});
   totals.totalUnits+=r.quantity;totals.stockEntered++;
  }
  await createAuditLogTx(tx,{session:{sub:userId}},"IMPORT","Invoice",invoice.id,{jobId:id,accessKey:doc.accessKey,source:doc.source,locationId:location.id,items:doc.items.length,totalUnits:totals.totalUnits});
  await tx.operationRequest.create({data:{key:identity,actorId:userId,scope:"invoice-receipt",inputHash:digest(JSON.stringify({doc,review})),response:totals}});
  await tx.importJob.update({where:{id},data:{status:"COMPLETED",processed:job.total,error:null,summary:totals as Prisma.InputJsonValue,rows:JSON.parse(JSON.stringify({document:doc,review}))}});
  return totals;
 },{timeout:120000,maxWait:10000});
}
