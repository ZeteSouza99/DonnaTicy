"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { exportToCsv } from "@/lib/format";

interface ReportShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  exportFilename?: string;
  exportRows?: Record<string, unknown>[];
  exportHeaders?: string[];
  toolbar?: React.ReactNode;
}

export function ReportShell({
  title,
  description,
  children,
  exportFilename,
  exportRows,
  exportHeaders,
  toolbar,
}: ReportShellProps): React.ReactNode {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/relatorios" className="rounded-lg p-2 hover:bg-gray-100 print:hidden" aria-label="Voltar">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {description && <p className="text-sm text-gray-500">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {toolbar}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Printer size={14} /> Exportar PDF
          </button>
          {exportRows && exportFilename && exportRows.length > 0 && (
            <button
              type="button"
              onClick={() => exportToCsv(exportFilename, exportRows, exportHeaders)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download size={14} /> Exportar CSV
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

interface KpiBoxProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warning";
}

export function KpiBox({ label, value, hint, tone = "default" }: KpiBoxProps): React.ReactNode {
  const toneClass = {
    default: "text-gray-900",
    positive: "text-emerald-600",
    negative: "text-red-600",
    warning: "text-amber-600",
  }[tone];
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}
