"use client";

import { useRef, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RECEIPT_PRINTING } from "@/lib/features";
import { checkPrintService, printTestReceipt } from "@/lib/print";

export default function PrintingPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function run(print: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const printer = await (print ? printTestReceipt() : checkPrintService());
      setMessage(print
        ? `Teste enviado à fila ${printer}. Confira se o recibo saiu na impressora.`
        : `Serviço conectado. Impressora configurada: ${printer}.`);
    } catch (cause) {
      setError(cause instanceof TypeError || (cause instanceof Error && ["TimeoutError", "AbortError"].includes(cause.name))
        ? "Não foi possível conectar ao serviço de impressão deste computador. Inicie o serviço local e confira a permissão de acesso à rede local no navegador."
        : cause instanceof Error ? cause.message : "Não foi possível enviar o teste.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="max-w-3xl space-y-6">
    <PageHeader title="Impressão de recibos" description="Teste a impressora USB conectada a este computador." />
    <section className="panel space-y-4" aria-labelledby="printer-title">
      <h2 id="printer-title" className="text-lg font-semibold">Teste de impressão</h2>
      <p className="text-sm text-gray-600">O teste imprime uma amostra de recibo de 80 mm, com texto, acentos e código de barras. Não registra venda, pagamento ou movimentação de estoque.</p>
      <p className="text-sm text-gray-600">A impressora precisa estar ligada, com papel e com o serviço de impressão Donna Ticy em execução neste PC. Se o navegador solicitar acesso à rede local, permita para conectar à impressora.</p>
      {!RECEIPT_PRINTING && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">A impressão ainda não está habilitada nesta versão do site.</p>}
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn-secondary" disabled={busy || !RECEIPT_PRINTING} onClick={() => void run(false)}><RefreshCw size={16} />Verificar conexão</button>
        <button type="button" className="btn-primary" disabled={busy || !RECEIPT_PRINTING} onClick={() => void run(true)}><Printer size={16} />Imprimir teste</button>
      </div>
      {busy && <p role="status" className="text-sm text-gray-600">Conectando à impressora...</p>}
      {message && <p role="status" className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    </section>
  </div>;
}
