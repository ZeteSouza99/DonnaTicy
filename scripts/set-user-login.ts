import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
if (process.env.DIRECT_DATABASE_URL) process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;

async function main(): Promise<void> {
  const { prisma } = await import("../src/lib/db");
  try {
    if (process.argv.includes("--list")) {
      const users = await prisma.user.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      });
      console.log(JSON.stringify(users));
      return;
    }
    // A senha chega por stdin, nunca por argumento de linha de comando ou arquivo.
    let body = "";
    for await (const chunk of process.stdin) {
      body += chunk;
      if (body.length > 4096) throw new Error("Entrada inválida.");
    }
    const { setUserLogin } = await import("../src/services/user-login-service");
    const result = await setUserLogin(JSON.parse(body));
    console.log(`Login atualizado: ${result.username}. As sessões anteriores foram encerradas.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code = (error as { code?: string })?.code;
  const message = code === "P2002" ? "Esse usuário já pertence a outra conta."
    : code === "P2025" ? "Conta não encontrada ou inativa."
    : "Não foi possível alterar o login. Confira a conexão, a migração e os dados informados.";
  // Não imprimir o objeto de erro: ele pode conter os dados de entrada.
  console.error(message);
  process.exitCode = 1;
});
