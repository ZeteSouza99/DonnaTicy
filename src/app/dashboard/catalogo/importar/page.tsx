"use client";

import { useState, useRef } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, X } from "lucide-react";

interface ImportSummary {
  invoicesProcessed: number;
  invoicesCreated: number;
  invoicesUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  variantsCreated: number;
  variantsUpdated: number;
  stockEntered: number;
  totalUnits: number;
  errors: { line: number; sku?: string; message: string }[];
}

interface ImportResponse {
  ok: boolean;
  dryRun?: boolean;
  totalRows?: number;
  validRows?: number;
  parseErrors?: { line: number; message: string }[];
  summary?: ImportSummary;
  message?: string;
}

export default function ImportarCatalogoPage(): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSelectFile(f: File | null): void {
    setResult(null);
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("Apenas arquivos .xlsx são aceitos.");
      return;
    }
    setFile(f);
  }

  async function send(dryRun: boolean): Promise<void> {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dryRun", String(dryRun));
      const res = await fetch("/api/imports/products", { method: "POST", body: fd });
      const text = await res.text();
      let json: ImportResponse;
      try {
        json = JSON.parse(text) as ImportResponse;
      } catch {
        // Resposta não-JSON (timeout do Vercel, erro de gateway, etc)
        const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
        setError(
          res.status === 504 || /timeout|gateway/i.test(snippet)
            ? "Tempo limite excedido no servidor. A planilha pode ser muito grande — tente importar em partes."
            : `Erro ${res.status}: ${snippet || "resposta vazia"}`
        );
        return;
      }
      if (!res.ok && !json.ok) {
        setError(json.message ?? "Erro ao importar.");
        setResult(json);
      } else {
        setResult(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setIsLoading(false);
    }
  }

  function reset(): void {
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Importar Catálogo (NF)</h1>
        <p className="mt-1 text-sm text-gray-600">
          Envie a planilha modelo &quot;Controle DonnaTicy&quot;. O sistema vai criar/atualizar produtos, variantes e
          dar entrada no estoque. Variantes são identificadas pelo <strong>SKU</strong> — duplicatas não serão criadas.
        </p>
      </header>

      {/* Download do modelo */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Modelo oficial</p>
            <p className="text-xs text-gray-500">Use este modelo como base para suas importações.</p>
          </div>
        </div>
        <a
          href="/api/imports/template"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Baixar template
        </a>
      </div>

      {/* Drop zone */}
      <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-8 text-center transition hover:border-brand-400">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
        />
        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mx-auto flex flex-col items-center gap-2 text-gray-600 hover:text-brand-600"
          >
            <Upload className="h-10 w-10" />
            <span className="text-sm font-semibold">Clique para selecionar a planilha</span>
            <span className="text-xs text-gray-400">.xlsx — máximo 10 MB</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <X className="inline h-3.5 w-3.5" /> Remover
            </button>
          </div>
        )}
      </div>

      {/* Ações */}
      {file && (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => send(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Validar (sem gravar)
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => send(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-brand-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar agora
          </button>
        </div>
      )}

      {/* Erro global */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {/* Resultado */}
      {result?.summary && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div className="text-sm font-semibold text-emerald-800">
              {result.dryRun
                ? "Validação concluída (nenhum dado foi gravado)"
                : "Importação concluída com sucesso!"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Linhas válidas" value={result.validRows ?? 0} />
            <Metric label="NFs únicas" value={result.summary.invoicesProcessed} />
            <Metric label="NFs criadas" value={result.summary.invoicesCreated} />
            <Metric label="Produtos criados" value={result.summary.productsCreated} />
            <Metric label="Produtos atualizados" value={result.summary.productsUpdated} />
            <Metric label="Variantes criadas" value={result.summary.variantsCreated} />
            <Metric label="Variantes atualizadas" value={result.summary.variantsUpdated} />
            <Metric label="Movimentos de entrada" value={result.summary.stockEntered} />
            <Metric label="Unidades em estoque" value={result.summary.totalUnits} highlight />
          </div>

          {(result.parseErrors?.length || result.summary.errors.length) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                Linhas com problema ({(result.parseErrors?.length ?? 0) + result.summary.errors.length})
              </p>
              <ul className="max-h-60 space-y-1 overflow-y-auto text-xs text-amber-900">
                {result.parseErrors?.map((e, i) => (
                  <li key={`p-${i}`}>
                    Linha {e.line}: {e.message}
                  </li>
                ))}
                {result.summary.errors.map((e, i) => (
                  <li key={`r-${i}`}>
                    Linha {e.line}{e.sku ? ` (SKU ${e.sku})` : ""}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }): React.JSX.Element {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight ? "border-brand-300 bg-brand-50" : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? "text-brand-700" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
