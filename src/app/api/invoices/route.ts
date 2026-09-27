import { NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPaginationParams, paginate } from "@/lib/pagination";
import { parseDateOnly } from "@/lib/date";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "invoices", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);
    const search = searchParams.get("search")?.trim();
    const supplierId = searchParams.get("supplierId") ?? undefined;

    const where = {
      ...(supplierId && { supplierId }),
      ...(search && {
        OR: [
          { number: { contains: search, mode: "insensitive" as const } },
          { supplierName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          supplier: { select: { id: true, companyName: true } },
          _count: { select: { items: true } },
        },
        skip,
        take: limit,
        orderBy: { issueDate: "desc" },
      }),
      prisma.invoice.count({ where }),
    ]);

    return NextResponse.json(paginate(data, total, page, limit));
  } catch (error) {
    return handleApiError(error);
  }
}

const createEntrySchema = z.object({
  issueDate: z.string().min(1, "Data de emissão é obrigatória."),
  description: z.string().trim().max(200).optional(),
  productsTotal: z.number().nonnegative(),
  freight: z.number().nonnegative().default(0),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requirePermission(request, "invoices", "write");
    const body = createEntrySchema.parse(await request.json());

    const number = `ENT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const entry = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          number,
          supplierName: "Entrada manual",
          issueDate: parseDateOnly(body.issueDate),
          description: body.description || null,
          productsTotal: body.productsTotal,
          freight: body.freight,
          invoiceTotal: body.productsTotal + body.freight,
        },
      });

      await tx.financialEntry.create({
        data: {
          type: "EXPENSE",
          category: "Mercadorias/Compras",
          description: body.description || `Entrada NF ${number}`,
          amount: body.productsTotal + body.freight,
          competenceDate: parseDateOnly(body.issueDate),
          dueDate: parseDateOnly(body.issueDate),
          status: "PENDING",
          documentType: "INVOICE",
          documentNumber: number,
        },
      });

      return invoice;
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
