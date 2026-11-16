import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { handleApiError, ValidationError } from "@/lib/errors";
import { getInvoiceDraft, saveInvoiceReview, confirmInvoiceReceipt } from "@/services/invoice-receipt-service";
export const runtime="nodejs";
export const maxDuration=120;
type Context={params:Promise<{id:string}>};
export async function GET(request:NextRequest,{params}:Context){try{const user=await requirePermission(request,"imports","write");return NextResponse.json(await getInvoiceDraft((await params).id,user.sub));}catch(e){return handleApiError(e,request);}}
async function body(request:NextRequest){const text=await request.text();if(text.length>300000)throw new ValidationError("Conferência muito extensa.");try{return JSON.parse(text);}catch{throw new ValidationError("Dados da conferência inválidos.");}}
export async function PUT(request:NextRequest,{params}:Context){try{const user=await requirePermission(request,"imports","write");return NextResponse.json(await saveInvoiceReview((await params).id,user.sub,await body(request)));}catch(e){return handleApiError(e,request);}}
export async function POST(request:NextRequest,{params}:Context){try{const user=await requirePermission(request,"imports","write");return NextResponse.json(await confirmInvoiceReceipt((await params).id,user.sub,await body(request)));}catch(e){return handleApiError(e,request);}}
