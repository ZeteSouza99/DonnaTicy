import { describe, expect, it } from "vitest";
import { execFile, spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RunnerResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

describe("runner de integração", () => {
  it("preserva a falha do Vitest após encerrar o PostgreSQL descartável", async ({ onTestFinished, signal }) => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const child = spawn(process.execPath, [
      resolve(root, "node_modules/tsx/dist/cli.mjs"),
      resolve(root, "scripts/test-integration.ts"),
      // O parser rejeita a opção antes de descobrir testes, impedindo recursão.
      "--donnaticy-intentional-invalid-option",
    ], {
      cwd: root,
      env: { ...process.env, NODE_ENV: "test", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let closed = false;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    const completed = new Promise<RunnerResult>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (exitCode, exitSignal) => {
        closed = true;
        resolve({ exitCode, signal: exitSignal, stdout, stderr });
      });
    });

    // Executado também no timeout: matar só o tsx pode deixar o PostgreSQL órfão.
    onTestFinished(async () => {
      if (closed || child.pid === undefined) return;
      if (process.platform === "win32") {
        await new Promise<void>((resolve, reject) => {
          execFile("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
            timeout: 5_000,
            windowsHide: true,
          }, (error) => error ? reject(error) : resolve());
        });
      } else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") throw error;
        }
      }
      await completed;
    }, 10_000);

    const result = await completed;
    const output = `${result.stdout}\n${result.stderr}`;
    expect(signal.aborted, output).toBe(false);
    expect(child.killed, output).toBe(false);
    expect(result.signal, output).toBeNull();
    expect(result.exitCode, output).toBe(1);
    expect(result.stdout).toContain("Iniciando PostgreSQL descartável em loopback; nenhum banco externo será usado.");
    expect(result.stdout).toContain("PostgreSQL de teste encerrado e dados temporários removidos.");
    expect(result.stderr).toMatch(/CACError: Unknown option `--donnaticy(?:IntentionalInvalidOption|-intentional-invalid-option)`/);
    expect(result.stderr).toMatch(/node_modules[\\/]vitest[\\/]dist[\\/]/);
    expect(result.stderr).toContain("Validação terminou com código 1.");
    expect(output).not.toMatch(/^\s*(?:RUN\s+v\d|Test Files\b|Tests\s+\d)/m);
    expect(output).not.toContain("No test files found");
  }, 90_000);
});