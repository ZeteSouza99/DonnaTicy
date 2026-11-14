/** Dados exclusivos do PostgreSQL descartável iniciado pelo runner. */
import { prisma } from "../src/lib/db";
import { createFixture } from "../tests/integration/fixtures";
import { integrationDatabaseUrl } from "../tests/integration/database";
async function main() {
integrationDatabaseUrl();
const fixture = await createFixture();
await prisma.user.update({where:{id:fixture.user.id},data:{name:"Operadora de teste",mustChangePassword:false}});
await prisma.setting.create({data:{key:"operational",group:"general",value:{monthlySalesGoal:15000,activeCustomerDays:90,storeCreditValidityDays:90}}});
await prisma.customer.create({data:{code:"CLI-2",fullName:"Marina de teste",phone:"92999990002"}});
const colors = ["Oliva","Areia","Marinho","Terracota"];
for (let i=0;i<8;i++) {
 const product=await prisma.product.create({data:{code:`QA-${i}`,name:["Vestido Linho","Blusa Essencial","Conjunto Aurora","Calça Alfaiataria"][i%4],collectionId:fixture.product.collectionId,lineId:fixture.product.lineId,categoryId:fixture.product.categoryId,technology:[],costPrice:50+i*5,basePrice:129.9+i*10,markup:2.5}});
 const color=await prisma.color.upsert({where:{code:`QA-${i%4}`},update:{},create:{code:`QA-${i%4}`,name:colors[i%4],hexValue:["#68762c","#d9c9a7","#203855","#b66b4a"][i%4]}});
 const variant=await prisma.productVariant.create({data:{productId:product.id,sku:`QA-${i}-M`,colorId:color.id,sizeId:fixture.variant.sizeId}});
 await prisma.stockPosition.create({data:{variantId:variant.id,locationId:fixture.location.id,quantity:12+i,minStock:3}});
}
console.log("Prévia isolada: operator@example.test / Integration-only-123. Porta 3100.");
await prisma.$disconnect();

}
main().catch(error => { console.error(error); process.exitCode = 1; });
