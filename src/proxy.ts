import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { canAccessPath } from "@/lib/permissions";
import {
  REQUEST_ID_HEADER,
  REQUEST_METHOD_HEADER,
  REQUEST_PATH_HEADER,
  resolveRequestId,
} from "@/lib/request-context";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

async function getTokenRole(token: string): Promise<string | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/**
 * Barreira de borda: assinatura do JWT e matriz de permissões por rota.
 * Revogação (tokenVersion/logout) e troca de senha obrigatória ficam nos handlers, que acessam o banco.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  const reply = (response: NextResponse): NextResponse => {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  };
  const forward = (): NextResponse => {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    headers.set(REQUEST_PATH_HEADER, pathname);
    headers.set(REQUEST_METHOD_HEADER, request.method);
    return reply(NextResponse.next({ request: { headers } }));
  };
  const deny = (status: 401 | 403, message: string, code: string): NextResponse =>
    reply(NextResponse.json({ error: { message, code, requestId } }, { status }));

  if (isPublicPath(pathname) || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return forward();
  }

  const session = request.cookies.get("session")?.value;
  const role = session ? await getTokenRole(session) : null;

  if (role === null) {
    if (pathname.startsWith("/dashboard")) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      if (session) response.cookies.set("session", "", { maxAge: 0, path: "/" });
      return reply(response);
    }
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
      return deny(401, "Não autorizado.", "UNAUTHORIZED");
    }
    return forward();
  }

  if (!canAccessPath(role, pathname, request.method)) {
    if (pathname.startsWith("/api/")) {
      return deny(403, "Acesso restrito para o seu perfil.", "FORBIDDEN");
    }
    if (pathname.startsWith("/dashboard")) {
      return reply(NextResponse.redirect(new URL("/dashboard", request.url)));
    }
  }

  return forward();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
