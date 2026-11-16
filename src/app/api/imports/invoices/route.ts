import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError } from "@/lib/errors";
import { createInvoiceDraft, invoiceReceiptOptions } from "@/services/invoice-receipt-service";
export const runtime="nodejs";
export async function GET(request:NextRequest){try{const user=await requirePermission(request,"imports","write");return NextResponse.json(await invoiceReceiptOptions(user.sub));}catch(e){return handleApiError(e,request);}}
export async function POST(request:NextRequest){try{
 const user=await requirePermission(request,"imports","write");
 const body=await request.text();if(body.length>300000)throw new ValidationError("A nota excede o limite de leitura.");
 let input:unknown;try{input=JSON.parse(body);}catch{throw new ValidationError("Dados da nota inválidos.");}
 return NextResponse.json(await createInvoiceDraft(user.sub,input),{status:201});
}catch(e){return handleApiError(e,request);}}
