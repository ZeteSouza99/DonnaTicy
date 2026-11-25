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

describe("etiquetas na MP-4200 TH", () => {
  const label = { productName: "Legging", colorName: "Preto", sizeName: "M", price: 189.9, barcode: "2000000012346", sku: "LEG-M", copies: 2 };

  async function load() {
    vi.resetModules();
    return import("../src/lib/print");
  }

  /** Documento mínimo para o fallback HTML; devolve o que estava no #print-root na hora do window.print(). */
  function stubBrowser() {
    vi.useFakeTimers();
    const root = { id: "", style: { display: "" }, innerHTML: "" };
    const classes = new Set<string>();
    const printed: { html: string; classes: string[] }[] = [];
    vi.stubGlobal("document", {
      getElementById: () => null,
      createElement: () => root,
      body: { appendChild: () => root, classList: {
        add: (...names: string[]) => names.forEach((c) => classes.add(c)),
        remove: (...names: string[]) => names.forEach((c) => classes.delete(c)),
      } },
    });
    vi.stubGlobal("window", { print: () => printed.push({ html: root.innerHTML, classes: [...classes] }) });
    return printed;
  }

  afterEach(() => vi.useRealTimers());

  it("envia as etiquetas ao serviço local em um único trabalho", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "online", printer: "MP-4200 TH" }))
      .mockResolvedValueOnce(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetch);
    const { printProductLabels } = await load();
    expect(await printProductLabels([label])).toBe("service");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ type: "product_labels", data: { labels: [label] } });
  });

  it.each([
    ["erro da fila", () => Promise.resolve(Response.json({ error: "Erro ao imprimir: sem papel" }, { status: 500 })), "sem papel"],
    ["envio sem resposta", () => Promise.reject(new DOMException("timeout", "TimeoutError")), "não respondeu"],
  ])("%s: informa o erro sem abrir a impressão do navegador", async (_name, secondCall, message) => {
    const printed = stubBrowser();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "online" }))
      .mockImplementationOnce(secondCall));
    const { printProductLabels } = await load();
    await expect(printProductLabels([label])).rejects.toThrow(message);
    await vi.runAllTimersAsync();
    expect(printed).toHaveLength(0);
  });

  it.each([
    ["serviço desligado", () => vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))],
    ["serviço instalado sem suporte a etiquetas", () => vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "online" }))
      .mockResolvedValueOnce(Response.json({ error: "Tipo de impressão inválido: product_labels" }, { status: 400 }))],
  ])("%s: imprime pelo navegador em páginas de 80 mm", async (_name, makeFetch) => {
    const printed = stubBrowser();
    vi.stubGlobal("fetch", makeFetch());
    const { printProductLabels } = await load();
    expect(await printProductLabels([label])).toBe("browser");
    await vi.runAllTimersAsync();
    expect(printed).toHaveLength(1);
    expect(printed[0].classes).toContain("printing-labels");
    expect(printed[0].html.match(/class="print-label"/g)).toHaveLength(2);
    expect(printed[0].html).toContain("R$ 189,90");
  });
});