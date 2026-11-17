"use client";
import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorMessage } from "@/components/ui/feedback";
import { detectImportFormat, IMPORT_ACCEPT, type ImportFormat } from "@/lib/import/import-files";
import { InvoiceImport } from "./invoice-import";
import { SpreadsheetImport } from "./spreadsheet-import";

const formatLabels: Record<ImportFormat, string> = { xlsx: "Planilha Excel", xml: "XML da NF-e", pdf: "PDF da nota", photo: "Fotos da nota" };
export default function ImportWorkspace() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<ImportFormat>("pdf");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [version, setVersion] = useState(0);
  const [inputVersion, setInputVersion] = useState(0);
  function selectFiles(input: HTMLInputElement) {
    const chosen = Array.from(input.files ?? []);
    setError("");
    if (!chosen.length) { setFiles([]); return; }
    try { setFormat(detectImportFormat(chosen)); setFiles(chosen); setVersion(v => v + 1); }
    catch (e) { setFiles([]); input.value = ""; setError(e instanceof Error ? e.message : "Não foi possível selecionar os arquivos."); }
  }
  function reset() {
    if (locked && !window.confirm("Escolher outro arquivo? Salve a conferência atual se quiser continuar depois. Alterações não salvas nesta tela serão descartadas.")) return;
    setFiles([]); setLocked(false); setError(""); setVersion(v => v + 1); setInputVersion(v => v + 1);
  }
  return <div className="mx-auto max-w-5xl space-y-6">
    <PageHeader title="Importar produtos e estoque" description="Envie XLSX, XML, PDF ou fotos. Confira os dados antes de confirmar a entrada." actions={<Link className="btn-secondary" href="/dashboard/notas-fiscais">Voltar às entradas</Link>}/>
    <section className="panel space-y-4 p-6">
      <h2 className="font-semibold">1. Escolha o arquivo</h2>
      <p className="text-sm text-gray-600">Uma planilha Excel, XML ou PDF por vez. Para fotos, selecione todas as páginas da mesma nota juntas (JPG, PNG ou WebP).</p>
      <label className="block space-y-2"><span className="field-label">Planilha, nota fiscal ou fotos</span><input key={inputVersion} type="file" multiple accept={IMPORT_ACCEPT} disabled={busy || locked} onChange={e => selectFiles(e.currentTarget)} className="block w-full rounded-xl border border-dashed border-gray-300 p-4 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2"/></label>
      <p className="text-xs text-gray-500">XLSX até 4 MB; XML, PDF e fotos até 10 MB por arquivo. Até 10 fotos e 25 MB no total. PDF e fotos precisam estar legíveis e conter os dados da nota.</p>
      {files.length > 0 && <div role="status" className="rounded-lg bg-gray-50 p-3 text-sm"><p className="font-medium">Formato identificado: {formatLabels[format]}</p><ul>{files.map((file, i) => <li key={i} className="break-all">{file.name}</li>)}</ul></div>}
      <div className="flex flex-wrap gap-3">
        <a href="/api/imports/template" className="btn-secondary"><Download size={16}/> Baixar modelo XLSX</a>
        {(files.length > 0 || locked) && <button className="btn-secondary" disabled={busy} onClick={reset}>Escolher outro arquivo</button>}
      </div>
      <p className="text-sm text-gray-500">Para Excel, use as colunas do modelo. A leitura não altera produtos nem estoque.</p>
    </section>
    {error && <ErrorMessage message={error}/>}
    {!files.length && !locked && <div className="flex flex-wrap gap-2" aria-label="Histórico de importações">
      <button className="btn-secondary" aria-pressed={format !== "xlsx"} disabled={busy} onClick={() => setFormat("pdf")}>Conferências de notas</button>
      <button className="btn-secondary" aria-pressed={format === "xlsx"} disabled={busy} onClick={() => setFormat("xlsx")}>Histórico de planilhas</button>
    </div>}
    {format === "xlsx"
      ? <SpreadsheetImport key={version} file={files[0] ?? null} onBusyChange={setBusy} onStart={() => setLocked(true)}/>
      : <InvoiceImport key={version} files={files} onBusyChange={setBusy} onStart={() => setLocked(true)}/>}
  </div>;
}
