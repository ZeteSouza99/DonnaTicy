import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError } from "@/lib/errors";
import { generateTemplateBuffer } from "@/lib/import/spreadsheet-parser";
const { permission } = vi.hoisted(() => ({ permission: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: permission }));
import { POST } from "@/app/api/imports/products/preview/route";

describe("API de conferência XLSX", () => {
  beforeEach(() => permission.mockReset().mockResolvedValue({ sub: "test-user" }));
  const request = (file?: File) => {
    const data = new FormData(); if (file) data.append("file", file);
    return new NextRequest("http://localhost/api/imports/products/preview", { method: "POST", body: data });
  };
  it("exige permissão antes de ler o arquivo", async () => {
    permission.mockRejectedValueOnce(new ForbiddenError());
    const input = request(); const spy = vi.spyOn(input, "formData");
    const response = await POST(input);
    expect(response.status).toBe(403); expect(spy).not.toHaveBeenCalled();
  });
  it("retorna dados extraídos sem chamar o importador ou gravar no banco", async () => {
    const response = await POST(request(new File([new Uint8Array(generateTemplateBuffer())], "entrada.xlsx")));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ totalUnits: 1, canImport: true });
    expect(permission).toHaveBeenCalledWith(expect.anything(), "imports", "write");
  });
  it("retorna 400 para falta de arquivo ou extensão incorreta", async () => {
    expect((await POST(request())).status).toBe(400);
    expect((await POST(request(new File(["pdf"], "nota.pdf")))).status).toBe(400);
  });
});
