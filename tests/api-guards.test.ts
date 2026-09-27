import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const API_DIR = join(process.cwd(), "src/app/api");
// Sem sessão por definição.
const PUBLIC_ROUTES = new Set(["auth/login", "auth/logout", "health"]);
// Só exigem estar logado, qualquer papel.
const AUTH_ONLY_ROUTES = new Set(["auth/me", "auth/change-password", "auth/mfa"]);

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("guardas das rotas de API", () => {
  const files = routeFiles(API_DIR);

  it("encontra as rotas", () => {
    expect(files.length).toBeGreaterThan(70);
  });

  for (const file of files) {
    const route = relative(API_DIR, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
    if (PUBLIC_ROUTES.has(route)) continue;

    it(`${route}: todo handler passa pela matriz de permissões`, () => {
      const handlers = readFileSync(file, "utf8")
        .split(/^export (?:async )?function (?=GET|POST|PUT|PATCH|DELETE)/m)
        .slice(1);
      expect(handlers.length).toBeGreaterThan(0);

      const guard = AUTH_ONLY_ROUTES.has(route)
        ? /await requireAuth\(request\)/
        : /await requirePermission\(request, "\w+", "(read|write|manage)"\)/;
      for (const handler of handlers) {
        const name = handler.slice(0, handler.indexOf("("));
        expect(guard.test(handler), `${route} ${name}`).toBe(true);
      }
    });
  }
});
