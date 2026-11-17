"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { ErrorMessage } from "@/components/ui/feedback";
import { useApiQuery } from "@/hooks/use-api-query";
import { clientFetch } from "@/lib/client-fetch";
import { parseApiError } from "@/lib/api-error";
import type { SpreadsheetPreview } from "@/lib/import/spreadsheet-preview";

type Job = { id: string; fileName: string; status: string; dryRun: boolean; total: number; processed: number; error: string | null; createdAt: string; parseErrors: { line: number; message: string }[]; summary: { productsCreated: number; productsUpdated: number; totalUnits: number; invoicesProcessed: number; errors: { line: number; message: string }[] } };
const labels: Record<string, string> = { PENDING: "Na fila", RUNNING: "Processando", COMPLETED: "Concluído", FAILED: "Requer atenção" };
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function SpreadsheetImport({ file, onBusyChange, onStart }: { file: File | null; onBusyChange: (busy: boolean) => void; onStart: () => void }) {
  const [preview, setPreview] = useState<SpreadsheetPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [page, setPage] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const history = useApiQuery<{ data: Job[] }>("/api/imports/products");
  const refreshHistory = history.refresh;
  const processing = busy || !!job && ["PENDING", "RUNNING"].includes(job.status);
  useEffect(() => { onBusyChange(processing); }, [processing, onBusyChange]);
  useEffect(() => {
    if (!job || !["PENDING", "RUNNING"].includes(job.status)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const updated = await clientFetch<Job>(`/api/imports/jobs/${job.id}`, { method: "POST" });
        if (!cancelled) { setJob(updated); refreshHistory(); }
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : "Conexão interrompida. Retome pelo histórico."); setJob(null); refreshHistory(); }
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [job, refreshHistory]);
  async function upload<T>(url: string): Promise<T> {
    if (!file) throw new Error("Selecione uma planilha XLSX.");
    const body = new FormData(); body.append("file", file);
    const response = await fetch(url, { method: "POST", body, credentials: "include" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw parseApiError(response.status, data);
    return data;
  }
  async function read() {
    if (!file || running.current) return;
    running.current = true; onStart(); setBusy(true); setError(""); setConfirmed(false);
    try { setPreview(await upload<SpreadsheetPreview>("/api/imports/products/preview")); setPage(0); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível ler a planilha."); }
    finally { running.current = false; setBusy(false); }
  }
  async function commit() {
    if (!preview?.canImport || !confirmed || running.current || job) return;
    running.current = true; setBusy(true); setError("");
    try { setJob(await upload<Job>("/api/imports/products")); refreshHistory(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível confirmar a entrada."); }
    finally { running.current = false; setBusy(false); }
  }
  async function resume(item: Job) {
    if (running.current) return;
    running.current = true; onStart(); setError(""); setBusy(true);
    try { setJob(item.status === "COMPLETED" ? item : await clientFetch<Job>(`/api/imports/jobs/${item.id}?retry=true`, { method: "POST" })); refreshHistory(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível retomar."); }
    finally { running.current = false; setBusy(false); }
  }
  const rows = preview?.rows.slice(page * 50, (page + 1) * 50) ?? [];
  const pages = Math.ceil((preview?.rows.length ?? 0) / 50);
  return <div className="space-y-6">
    <button className="btn-primary" disabled={!file || processing || !!preview || !!job} onClick={() => void read()}>{busy ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>} Ler arquivo</button>
    {(error || history.error) && <ErrorMessage message={error || String(history.error)}/>}
    {preview && <section className="panel space-y-4 p-6">
      <h2 className="font-semibold">2. Confira os dados da planilha</h2>
      <p className="text-sm">{preview.rows.length} linhas válidas · {preview.invoices} notas · {preview.totalUnits} peças</p>
      <p className="text-sm text-gray-600">Destino: estoque MATRIZ, coleção e linha DEFAULT. Os dados e preços dos produtos existentes serão atualizados conforme a planilha. Para corrigir algum dado, edite o XLSX e escolha o arquivo novamente.</p>
      {preview.errors.length > 0 && <div role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">Corrija os erros antes de confirmar:</p><ul className="mt-2 space-y-1">{preview.errors.map((e, i) => <li key={i}>Linha {e.line}: {e.message}</li>)}</ul></div>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Produtos e quantidades extraídos da planilha</caption><thead><tr>{["Nota / fornecedor", "Produto / SKU", "Cor / tamanho", "Categoria", "Quantidade", "Custo real", "Preço de venda"].map(text => <th scope="col" key={text} className="whitespace-nowrap border-b p-3">{text}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={page * 50 + i}><td className="border-b p-3">{row.invoiceNumber}<br/>{row.supplierName}</td><td className="border-b p-3">{row.internalName}<br/><span className="text-xs text-gray-500">{row.sku}</span></td><td className="border-b p-3">{row.colorName} / {row.sizeName}</td><td className="border-b p-3">{row.categoryName}</td><td className="border-b p-3">{row.quantity}</td><td className="whitespace-nowrap border-b p-3">{money(row.realCost)}</td><td className="whitespace-nowrap border-b p-3">{money(row.commercialValue)}</td></tr>)}</tbody></table></div>
      {pages > 1 && <div className="flex items-center gap-3"><button className="btn-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button><span className="text-sm">Página {page + 1} de {pages}</span><button className="btn-secondary" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>Próxima</button></div>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={processing || !!job || !preview.canImport} onChange={e => setConfirmed(e.target.checked)} className="mt-1"/>Conferi os produtos, quantidades, cores, tamanhos e preços. Autorizo a entrada no estoque MATRIZ e a atualização dos cadastros pela planilha.</label>
      <button className="btn-primary" disabled={!preview.canImport || !confirmed || processing || !!job} onClick={() => void commit()}>Confirmar entrada</button>
    </section>}
    {job && <section className="panel space-y-4 p-6" aria-live="polite">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{job.dryRun ? "Validação" : "Importação"}: {job.fileName}</h2><span className="text-sm">{labels[job.status]}</span></div>
      <progress className="h-2 w-full accent-brand-600" value={job.processed} max={job.total}/>
      <p className="text-sm">{job.processed} de {job.total} linhas processadas. {job.dryRun ? "Esta validação não altera produtos ou estoque." : "As notas concluídas ficam salvas. Se a conexão cair, retome pelo histórico."}</p>
      {job.error && <ErrorMessage message={job.error}/>}
      {job.status === "COMPLETED" && <p>{job.summary.invoicesProcessed} notas · {job.summary.productsCreated} produtos novos · {job.summary.productsUpdated} atualizados · {job.summary.totalUnits} unidades{job.dryRun ? " previstas" : " processadas"}</p>}
      {(job.parseErrors.length > 0 || job.summary.errors.length > 0) && <ul className="text-sm text-amber-800">{[...job.parseErrors, ...job.summary.errors].map((e, i) => <li key={i}>Linha {e.line}: {e.message}</li>)}</ul>}
    </section>}
    <section className="panel space-y-3 p-6"><h2 className="font-semibold">Últimas planilhas enviadas</h2>{!history.data?.data.length && <p className="text-sm text-gray-500">Nenhuma importação registrada.</p>}{history.data?.data.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><div><p className="break-all text-sm">{item.fileName}</p><p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString("pt-BR")} · {item.dryRun ? "Validação" : "Importação"} · {labels[item.status]} · {item.processed}/{item.total}</p></div><button className="btn-secondary" disabled={processing} onClick={() => void resume(item)}>{item.status === "COMPLETED" ? "Ver resultado" : "Retomar"}</button></div>)}</section>
  </div>;
}
