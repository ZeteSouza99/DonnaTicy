import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ZodError } from "zod/v4";
import {
  REQUEST_ID_HEADER,
  REQUEST_METHOD_HEADER,
  REQUEST_PATH_HEADER,
  resolveRequestId,
} from "./request-context";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string) {
    super(404, `${entity} não encontrado(a).`, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, "CONFLICT");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autorizado.") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado.") {
    super(403, message, "FORBIDDEN");
  }
}

export class PasswordChangeRequiredError extends AppError {
  constructor() {
    super(403, "Troque a senha provisória para continuar.", "PASSWORD_CHANGE_REQUIRED");
  }
}

interface ErrorResponseBody {
  error: {
    message: string;
    code?: string;
    requestId: string;
    details?: Array<{ field: string; message: string }>;
  };
}

interface RequestContext {
  requestId: string;
  method?: string;
  path?: string;
}

/**
 * Correlaciona a resposta de erro com os logs. Sem o `request`, usa os
 * cabeçalhos que o proxy injeta em toda requisição.
 */
async function resolveRequestContext(request?: Request): Promise<RequestContext> {
  if (request) {
    return {
      requestId: resolveRequestId(request.headers.get(REQUEST_ID_HEADER)),
      method: request.method,
      path: new URL(request.url).pathname,
    };
  }
  try {
    const incoming = await headers();
    return {
      requestId: resolveRequestId(incoming.get(REQUEST_ID_HEADER)),
      method: incoming.get(REQUEST_METHOD_HEADER) ?? undefined,
      path: incoming.get(REQUEST_PATH_HEADER) ?? undefined,
    };
  } catch {
    // Fora do escopo de uma requisição do Next (ex.: handler chamado direto nos testes).
    return { requestId: resolveRequestId(null) };
  }
}

function errorResponse(
  body: ErrorResponseBody,
  status: number,
): NextResponse<ErrorResponseBody> {
  return NextResponse.json(body, {
    status,
    headers: { [REQUEST_ID_HEADER]: body.error.requestId },
  });
}

function logApiError(
  level: "warn" | "error",
  ctx: RequestContext,
  status: number,
  code: string,
  error: unknown,
): void {
  const entry = {
    scope: "api",
    level,
    requestId: ctx.requestId,
    status,
    code,
    method: ctx.method,
    path: ctx.path,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString(),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.warn(line);
}

export async function handleApiError(
  error: unknown,
  request?: Request,
): Promise<NextResponse<ErrorResponseBody>> {
  const ctx = await resolveRequestContext(request);
  const { requestId } = ctx;

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logApiError("error", ctx, error.statusCode, error.code ?? "APP_ERROR", error);
    }
    return errorResponse(
      { error: { message: error.message, code: error.code, requestId } },
      error.statusCode,
    );
  }

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.map(String).join(".") || "(raiz)",
      message: issue.message,
    }));
    const summary = details.map((d) => `${d.field}: ${d.message}`).join("; ");

    return errorResponse(
      {
        error: {
          message: `Dados inválidos. ${summary}`,
          code: "VALIDATION_ERROR",
          requestId,
          details,
        },
      },
      400,
    );
  }

  // Prisma known errors
  if (isPrismaError(error)) {
    if (error.code === "P2002") {
      const target = (error.meta?.target as string[])?.join(", ") ?? "campo";
      return errorResponse(
        {
          error: {
            message: `Registro duplicado no campo: ${target}.`,
            code: "CONFLICT",
            requestId,
          },
        },
        409,
      );
    }
    if (error.code === "P2025") {
      return errorResponse(
        { error: { message: "Registro não encontrado.", code: "NOT_FOUND", requestId } },
        404,
      );
    }
    if (error.code === "P2003") {
      const field = (error.meta?.field_name as string) ?? "campo";
      return errorResponse(
        {
          error: {
            message: `Registro referenciado não encontrado: ${field}.`,
            code: "FOREIGN_KEY_ERROR",
            requestId,
          },
        },
        400,
      );
    }
    if (error.code === "P2014") {
      return errorResponse(
        {
          error: {
            message: "Operação violaria uma relação obrigatória.",
            code: "REQUIRED_RELATION",
            requestId,
          },
        },
        400,
      );
    }

    logApiError("error", ctx, 500, error.code, error);
    return errorResponse(
      { error: { message: "Erro interno do servidor.", code: "INTERNAL_ERROR", requestId } },
      500,
    );
  }

  logApiError("error", ctx, 500, "INTERNAL_ERROR", error);

  return errorResponse(
    { error: { message: "Erro interno do servidor.", code: "INTERNAL_ERROR", requestId } },
    500,
  );
}

interface PrismaError {
  code: string;
  meta?: Record<string, unknown>;
}

function isPrismaError(error: unknown): error is PrismaError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as PrismaError).code === "string" &&
    (error as PrismaError).code.startsWith("P")
  );
}
