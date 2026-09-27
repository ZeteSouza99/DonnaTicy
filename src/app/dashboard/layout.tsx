import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getSessionFromCookie, loadSessionUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";
import { REQUEST_PATH_HEADER } from "@/lib/request-context";

const ACCOUNT_PAGE = "/dashboard/configuracoes/conta";

/**
 * Server Component: carrega a sessão uma vez por navegação completa, barra
 * sessões revogadas (o proxy só confere a assinatura) e entrega papel e nome
 * ao menu e ao cabeçalho, sem chamadas extras a /api/auth/me.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const session = await getSessionFromCookie();
  if (!session) redirect("/login");

  const user = await loadSessionUser(session).catch((error: unknown) => {
    if (error instanceof UnauthorizedError) return null;
    throw error;
  });
  if (!user) redirect("/login");

  if (user.mustChangePassword && (await headers()).get(REQUEST_PATH_HEADER) !== ACCOUNT_PAGE) {
    redirect(ACCOUNT_PAGE);
  }

  return (
    <DashboardShell user={{ name: user.name, role: session.role }}>
      {children}
    </DashboardShell>
  );
}
