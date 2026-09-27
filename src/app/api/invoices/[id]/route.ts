import { NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { parseDateOnly } from "@/lib/date";
import { createAuditLog, getClientIp } from "@/lib/audit";

export const runtime = "nodejs";

const updateInvoiceEntrySchema = z.object({
  issueDate: z.string().min(1).optional(),
  description: z.string().trim().max(200).optional(),
  productsTotal: z.number().nonnegative().optional(),
  freight: z.number().nonnegative().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requirePermission(request, "invoices", "read");
    const { id } = await params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, companyName: true, cnpj: true } },
        items: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                product: { select: { name: true, code: true } },
                color: { select: { name: true, hexValue: true } },
                size: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Nota fiscal não encontrada" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "invoices", "write");
    const { id } = await params;
    const input = updateInvoiceEntrySchema.parse(await request.json());

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Nota fiscal não encontrada" }, { status: 404 });
    }

    const productsTotal = input.productsTotal ?? Number(existing.productsTotal);
    const freight = input.freight ?? Number(existing.freight);

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(input.issueDate !== undefined && { issueDate: parseDateOnly(input.issueDate) }),
        ...(input.description !== undefined && { description: input.description || null }),
        ...(input.productsTotal !== undefined && { productsTotal: input.productsTotal }),
        ...(input.freight !== undefined && { freight: input.freight }),
        ...((input.productsTotal !== undefined || input.freight !== undefined) && {
          invoiceTotal: productsTotal + freight,
        }),
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "Invoice",
      id,
      input,
    );

    return NextResponse.json(invoice);
  } catch (error) {
    return handleApiError(error);
  }
}
