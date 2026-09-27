import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, clearSessionCookie, revokeToken } from "@/lib/auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    // Mesmo que a revogação falhe, o cookie é apagado; o token ainda expira sozinho.
    await revokeToken(token).catch((error: unknown) => {
      console.error(JSON.stringify({ scope: "auth", level: "error", message: "Falha ao revogar sessão no logout", error: String(error) }));
    });
  }

  const response = NextResponse.json({ message: "Logout realizado com sucesso." });
  clearSessionCookie(response);
  return response;
}
