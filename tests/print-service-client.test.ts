import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPrintService, printTestReceipt } from "../src/lib/print";

afterEach(() => vi.unstubAllGlobals());

describe("teste de impressão pelo site", () => {
  it("envia só uma amostra local de valor zero, sem criar pedido", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "online", printer: "MP-4200 TH" }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetch);
    expect(await printTestReceipt()).toBe("MP-4200 TH");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:15555/status", "http://127.0.0.1:15555/print",
    ]);
    const payload = JSON.parse(fetch.mock.calls[1][1].body);
    expect(payload.data.code).toBe("TESTE-WEB-USB");
    expect(payload.data.total).toBe(0);
    expect(payload.store.storeTagline).toBe("TESTE DE IMPRESSÃO WEB");
  });

  it("não imprime quando o serviço não responde como esperado", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "offline" }));
    vi.stubGlobal("fetch", fetch);
    await expect(printTestReceipt()).rejects.toThrow("inválida");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("informa erro da fila sem repetir nem abrir impressão alternativa", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "online", printer: "MP-4200 TH" }))
      .mockResolvedValueOnce(Response.json({ error: "Impressora indisponível" }, { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    await expect(printTestReceipt()).rejects.toThrow("Impressora indisponível");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sempre consulta o estado atual ao verificar conexão", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ status: "online", printer: "MP-4200 TH" }));
    vi.stubGlobal("fetch", fetch);
    await checkPrintService();
    await checkPrintService();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
