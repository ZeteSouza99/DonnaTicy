import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { updateUserSchema } from "@/schemas/auth";
import { createAuditLog, getClientIp } from "@/lib/audit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    await requirePermission(request, "users", "read");
    const { id } = await params;

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locationId: true,
        isActive: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundError("Usuário");
    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "users", "write");
    const { id } = await params;
    const body = await request.json();
    const input = updateUserSchema.parse(body);
    const { resetMfa, ...changes } = input;

    const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Usuário");

    // Mudança de papel, de loja, desativação ou reset do 2FA invalida os tokens em circulação.
    const revokeSessions =
      Boolean(resetMfa) ||
      (input.role !== undefined && input.role !== existing.role) ||
      (input.locationId !== undefined && input.locationId !== existing.locationId) ||
      (input.isActive !== undefined && input.isActive !== existing.isActive);

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...changes,
        ...(resetMfa && { mfaEnabled: false, mfaSecret: null, mfaLastStep: null }),
        ...(revokeSessions && { tokenVersion: { increment: 1 } }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locationId: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "UPDATE",
      "User",
      id,
      input,
    );

    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const session = await requirePermission(request, "users", "write");
    const { id } = await params;

    const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError("Usuário");

    if (id === session.sub) {
      return NextResponse.json(
        { error: "Você não pode deletar seu próprio usuário." },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, tokenVersion: { increment: 1 } },
    });

    await createAuditLog(
      { session, ipAddress: getClientIp(request) },
      "DELETE",
      "User",
      id,
    );

    return NextResponse.json({ message: "Usuário removido com sucesso." });
  } catch (error) {
    return handleApiError(error);
  }
}
