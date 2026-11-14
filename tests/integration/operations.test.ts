import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { createFixture, request, params, resetDatabase } from "./fixtures";
import { POST as sell } from "@/app/api/orders/route";
import { POST as exchange } from "@/app/api/sales/exchanges/route";
import { POST as createReturn } from "@/app/api/logistics/returns/route";
import { PATCH as resolveReturn } from "@/app/api/logistics/returns/[id]/route";
import { GET as stockList } from "@/app/api/inventory/stock/route";
import { GET as health } from "@/app/api/health/route";
import { GET as maintenance } from "@/app/api/maintenance/route";
import { runAutomations } from "@/services/automation-service";
import { financialTotals } from "@/services/reporting-service";
import { advanceImportJob } from "@/services/import-job-service";
import { NextRequest } from "next/server";
let fixture: Awaited<ReturnType<typeof createFixture>>;
beforeEach(async()=>{await resetDatabase();fixture=await createFixture();});
afterAll(()=>prisma.$disconnect());
function saleInput() {return {channel:"STORE",customerId:fixture.customer.id,locationId:fixture.location.id,items:[{variantId:fixture.variant.id,quantity:2}],payments:[{method:"PIX",amount:200}]};}
async function sale(discount=false) {
 const input: Record<string,unknown> = saleInput();
 if(discount) {await prisma.coupon.create({data:{code:"LESS",discountType:"FIXED",discountValue:40,validFrom:new Date("2000-01-01"),validUntil:new Date("2100-01-01")}});input.couponCode="LESS";input.payments=[{method:"PIX",amount:160}];}
 const response=await sell(request("POST","/api/orders",fixture.token,input));expect(response.status).toBe(201);
 const order=await response.json();const item=await prisma.orderItem.findFirstOrThrow({where:{orderId:order.id}});return {order,item};
}
function returnInput(orderId:string,itemId:string,quantity=1){return {orderId,customerId:fixture.customer.id,type:"RETURN",items:[{orderItemId:itemId,variantId:fixture.variant.id,quantity,reason:"REGRET"}]};}
describe("operações consistentes",()=>{
 it("reenvios concorrentes geram uma venda, uma receita e uma baixa",async()=>{
  const key=randomUUID();const send=()=>{const req=request("POST","/api/orders",fixture.token,saleInput());req.headers.set("Idempotency-Key",key);return sell(req);};
  const responses=await Promise.all([send(),send()]);expect(responses.map(r=>r.status)).toEqual([201,201]);
  const [first,second]=await Promise.all(responses.map(r=>r.json()));expect(first.id).toBe(second.id);
  expect(await prisma.order.count()).toBe(1);expect(await prisma.financialEntry.count()).toBe(1);
  expect((await prisma.stockPosition.findFirstOrThrow()).quantity).toBe(8);
  const changed=request("POST","/api/orders",fixture.token,{...saleInput(),notes:"outro pedido"});changed.headers.set("Idempotency-Key",key);
  expect((await sell(changed)).status).toBe(409);
 });
 it("rateia desconto, compartilha o saldo e cria vale na devolução",async()=>{
  const {order,item}=await sale(true);expect(Number(item.totalPrice)).toBe(160);expect(Number(item.discount)).toBe(40);
  const first=await exchange(request("POST","/api/sales/exchanges",fixture.token,{orderId:order.id,locationId:fixture.location.id,returnedItems:[{orderItemId:item.id,quantity:1}],newItems:[]}));
  expect(first.status,JSON.stringify(await first.clone().json())).toBe(201);expect(Number((await first.json()).amountReturned)).toBe(80);
  const tooMany=await createReturn(request("POST","/api/logistics/returns",fixture.token,returnInput(order.id,item.id,2)));expect(tooMany.status).toBe(400);
  const created=await createReturn(request("POST","/api/logistics/returns",fixture.token,returnInput(order.id,item.id)));expect(created.status).toBe(201);const ret=await created.json();
  const resolve=(credit:number)=>resolveReturn(request("PATCH",`/api/logistics/returns/${ret.id}`,fixture.token,{status:"RESOLVED",inspectionResult:"APPROVED",resolution:"STORE_CREDIT",storeCreditAmount:credit}),params(ret.id));
  expect((await resolve(100)).status).toBe(400);expect((await resolve(80)).status).toBe(200);expect((await resolve(80)).status).toBe(200);
  expect(await prisma.storeCredit.count()).toBe(2);expect((await prisma.stockPosition.findFirstOrThrow()).quantity).toBe(10);
  const totals=await financialTotals(new Date("2000-01-01"),new Date("2100-01-01"));expect(totals.netRevenue).toBe(0);expect(totals.cogs).toBe(0);
 });
 it("duas devoluções abertas não reservam a mesma unidade",async()=>{
  const {order,item}=await sale();const send=()=>createReturn(request("POST","/api/logistics/returns",fixture.token,returnInput(order.id,item.id,2)));
  const responses=await Promise.all([send(),send()]);expect(responses.map(r=>r.status).sort()).toEqual([201,400]);expect(await prisma.returnRequest.count()).toBe(1);
 });
 it("solicitações abertas não repetem o centavo de arredondamento",async()=>{
  await prisma.product.update({where:{id:fixture.product.id},data:{basePrice:1}});
  await prisma.coupon.create({data:{code:"ROUND",discountType:"FIXED",discountValue:2,validFrom:new Date("2000-01-01"),validUntil:new Date("2100-01-01")}});
  const sold=await sell(request("POST","/api/orders",fixture.token,{...saleInput(),couponCode:"ROUND",items:[{variantId:fixture.variant.id,quantity:3}],payments:[{method:"PIX",amount:1}]}));expect(sold.status).toBe(201);const order=await sold.json();const item=await prisma.orderItem.findFirstOrThrow({where:{orderId:order.id}});
  const ids=[];
  for(let i=0;i<3;i++){const response=await createReturn(request("POST","/api/logistics/returns",fixture.token,returnInput(order.id,item.id)));expect(response.status).toBe(201);ids.push((await response.json()).id);}
  for(const [index,refundAmount] of [0.33,0.34,0.33].entries()){
   const response=await resolveReturn(request("PATCH",`/api/logistics/returns/${ids[index]}`,fixture.token,{status:"RESOLVED",inspectionResult:"APPROVED",resolution:"REFUND",refundAmount}),params(ids[index]));expect(response.status,JSON.stringify(await response.json())).toBe(200);
  }
  const refunds=await prisma.financialEntry.aggregate({where:{type:"REFUND"},_sum:{amount:true}});expect(Number(refunds._sum.amount)).toBe(1);
 });
 it("estoque mínimo usa disponível e respeita o local",async()=>{
  await prisma.stockPosition.updateMany({data:{quantity:10,reservedQty:9,minStock:2}});
  const other=await prisma.location.create({data:{code:"OTHER",name:"Outra loja",type:"STORE"}});
  const first=await stockList(request("GET",`/api/inventory/stock?belowMin=true&locationId=${fixture.location.id}`,fixture.token));expect((await first.json()).total).toBe(1);
  const second=await stockList(request("GET",`/api/inventory/stock?belowMin=true&locationId=${other.id}`,fixture.token));expect((await second.json()).total).toBe(0);
 });
 it("health não altera dados e manutenção recusa chamada sem segredo",async()=>{
  const credit=await prisma.storeCredit.create({data:{code:"EXPIRED",customerId:fixture.customer.id,amount:10,remainingAmount:10,expiresAt:new Date("2000-01-01")}});
  expect((await health()).status).toBe(200);expect((await prisma.storeCredit.findUniqueOrThrow({where:{id:credit.id}})).status).toBe("ACTIVE");
  expect((await maintenance(new NextRequest("http://localhost/api/maintenance"))).status).toBe(401);
 });
 it("CRM respeita intervalo, limite e execução concorrente",async()=>{
  await prisma.customer.update({where:{id:fixture.customer.id},data:{lifetimeValue:2000}});
  const rule=await prisma.automationTrigger.create({data:{name:"Acompanhar",conditionType:"LTV_MILESTONE",conditionConfig:{amount:1000},actionType:"CREATE_TASK",actionConfig:{title:"Conferir satisfação"},channels:[],throttleDays:30,maxFiresPerCustomer:1}});
  await Promise.all([runAutomations(),runAutomations()]);expect(await prisma.crmTask.count()).toBe(1);expect((await prisma.automationTrigger.findUniqueOrThrow({where:{id:rule.id}})).totalFired).toBe(1);
  await runAutomations(new Date(Date.now()+40*86400000));expect(await prisma.crmTask.count()).toBe(1);
 });
 it("CRM concede pontos uma vez e não executa envios externos",async()=>{
  await prisma.customer.update({where:{id:fixture.customer.id},data:{lifetimeValue:2000}});
  const base={conditionType:"LTV_MILESTONE" as const,conditionConfig:{amount:1000},channels:[],throttleDays:30};
  await prisma.automationTrigger.create({data:{...base,name:"Bônus",actionType:"ASSIGN_POINTS",actionConfig:{points:75}}});
  await prisma.automationTrigger.create({data:{...base,name:"Envio sem provedor",actionType:"SEND_MESSAGE",actionConfig:{}}});
  await runAutomations();await runAutomations();expect((await prisma.customer.findUniqueOrThrow({where:{id:fixture.customer.id}})).loyaltyPoints).toBe(75);expect(await prisma.automationExecution.count()).toBe(1);
 });
 it("job falho pode retomar e confirmação repetida não repete o estoque",async()=>{
  const row={invoiceNumber:"999",invoiceDate:"2026-11-14T12:00:00.000Z",supplierName:"Teste",freight:0,productsTotal:40,invoiceTotal:40,invoiceDescription:"Teste",internalName:"Blusa",sku:"IMPORT-01",colorName:"Preto",sizeName:"M",categoryName:"Teste",unit:"UN",quantity:1,unitPrice:40,totalPrice:40,realCost:40,margin:60,costMargin:40,commercialValue:100,discount:0,icmsBase:0,icmsValue:0,ipiValue:0,icmsRate:0,ipiRate:0};
  const summary={invoicesProcessed:0,invoicesCreated:0,invoicesUpdated:0,productsCreated:0,productsUpdated:0,variantsCreated:0,variantsUpdated:0,stockEntered:0,totalUnits:0,errors:[]};
  const job=await prisma.importJob.create({data:{userId:fixture.user.id,fileName:"Teste.xlsx",fileHash:"test",dryRun:false,rows:[row],total:1,summary,parseErrors:[]}});
  expect((await advanceImportJob(job.id,fixture.user.id)).status).toBe("FAILED");expect(await prisma.invoice.count()).toBe(0);
  await prisma.location.update({where:{id:fixture.location.id},data:{code:"MATRIZ"}});await prisma.collection.updateMany({data:{code:"DEFAULT"}});await prisma.line.updateMany({data:{code:"DEFAULT"}});
  const done=await advanceImportJob(job.id,fixture.user.id,true);expect(done.status,done.error ?? "").toBe("COMPLETED");expect(done.processed).toBe(1);
  await advanceImportJob(job.id,fixture.user.id,true);expect(await prisma.invoiceItem.count()).toBe(1);expect(await prisma.stockMovement.count()).toBe(1);
 });
});
