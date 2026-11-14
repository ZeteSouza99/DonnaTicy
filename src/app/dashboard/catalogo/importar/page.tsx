"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorMessage } from "@/components/ui/feedback";
import { useApiQuery } from "@/hooks/use-api-query";
import { clientFetch } from "@/lib/client-fetch";
import { parseApiError } from "@/lib/api-error";

type Job = { id: string; fileName: string; status: string; dryRun: boolean; total: number; processed: number; error: string | null; createdAt: string; parseErrors: { line: number; message: string }[]; summary: { productsCreated: number; productsUpdated: number; totalUnits: number; invoicesProcessed: number; errors: { line: number; message: string }[] } };
const labels: Record<string,string> = { PENDING: "Na fila", RUNNING: "Processando", COMPLETED: "Concluído", FAILED: "Requer atenção" };
export default function ImportarCatalogoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const history = useApiQuery<{ data: Job[] }>("/api/imports/products");
  const refreshHistory = history.refresh;
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
  async function send(dryRun: boolean) {
    if (!file || running.current) return;
    running.current = true; setBusy(true); setError(null);
    try {
      const body = new FormData(); body.append("file", file); body.append("dryRun", String(dryRun));
      const response = await fetch("/api/imports/products", { method: "POST", body, credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw parseApiError(response.status, data);
      setJob(data); refreshHistory();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível enviar a planilha."); }
    finally { running.current = false; setBusy(false); }
  }
  async function resume(item: Job) {
    setError(null); setBusy(true);
    try { setJob(await clientFetch<Job>(`/api/imports/jobs/${item.id}?retry=true`, { method: "POST" })); refreshHistory(); }
    catch(err) { setError(err instanceof Error ? err.message : "Não foi possível retomar."); }
    finally { setBusy(false); }
  }
  const processing = busy || !!job && ["PENDING", "RUNNING"].includes(job.status);
  return <div className="mx-auto max-w-4xl space-y-6">
    <PageHeader title="Importar catálogo" description="Produtos e estoque por nota fiscal, com progresso salvo a cada nota." actions={<a href="/api/imports/template" className="btn-secondary"><Download size={16}/> Baixar modelo</a>}/>
    <section className="panel space-y-5 p-6">
      <div className="flex items-start gap-3"><FileSpreadsheet className="text-brand-600"/><div><h2 className="font-semibold">Envie sua planilha</h2><p className="mt-1 text-sm text-gray-500">Arquivo .xlsx de até 10 MB e 5.000 linhas. Valide antes de importar. Notas já importadas não geram uma segunda entrada.</p></div></div>
      <label className="block rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6"><span className="field-label">Planilha de entrada</span><input type="file" accept=".xlsx" disabled={processing} onChange={e => {setFile(e.target.files?.[0] ?? null); setError(null);}} className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-white file:px-4 file:py-3 file:font-medium"/></label>
      <div className="form-actions flex flex-wrap justify-end gap-3"><button className="btn-secondary" disabled={!file || processing} onClick={() => send(true)}>Validar planilha</button><button className="btn-primary" disabled={!file || processing} onClick={() => send(false)}>{processing ? <Loader2 size={16} className="animate-spin"/> : <Upload size={16}/>} Importar</button></div>
    </section>
    {error && <ErrorMessage message={error}/>}
    {job && <section className="panel space-y-4 p-6" aria-live="polite"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{job.dryRun ? "Validação" : "Importação"}: {job.fileName}</h2><span className="text-sm">{labels[job.status]}</span></div><progress className="h-2 w-full accent-brand-600" value={job.processed} max={job.total}/><p className="text-sm text-gray-600">{job.processed} de {job.total} linhas processadas. {job.dryRun ? "Esta validação não altera produtos ou estoque." : "Você pode sair e retomar pelo histórico. As notas concluídas permanecem salvas."}</p>
      {job.error && <ErrorMessage message={job.error}/>}
      {job.status === "COMPLETED" && <p className="text-sm">{job.summary.invoicesProcessed} notas · {job.summary.productsCreated} produtos novos · {job.summary.productsUpdated} atualizados · {job.summary.totalUnits} unidades{job.dryRun ? " previstas" : " processadas"}</p>}
      {(job.parseErrors.length > 0 || job.summary.errors.length > 0) && <ul className="space-y-2 text-sm text-amber-800">{[...job.parseErrors,...job.summary.errors].map((e,i) => <li key={i}>Linha {e.line}: {e.message}</li>)}</ul>}
    </section>}
    <section className="panel p-6"><h2 className="mb-4 font-semibold">Últimos envios</h2>{history.error && <ErrorMessage message={history.error} onRetry={history.refresh}/>}{!history.data?.data.length && <p className="text-sm text-gray-500">Nenhuma importação registrada.</p>}<div className="divide-y divide-gray-100">{history.data?.data.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="break-all text-sm font-medium">{item.fileName}</p><p className="mt-1 text-xs text-gray-500">{new Date(item.createdAt).toLocaleString("pt-BR")} · {item.dryRun ? "Validação" : "Importação"} · {labels[item.status]} · {item.processed}/{item.total}</p></div><button className="btn-secondary" disabled={processing} onClick={() => item.status === "COMPLETED" ? setJob(item) : resume(item)}>{item.status === "COMPLETED" ? "Ver resultado" : "Retomar"}</button></div>)}</div></section>
  </div>;
}
