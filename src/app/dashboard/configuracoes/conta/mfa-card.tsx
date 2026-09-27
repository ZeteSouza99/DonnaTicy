"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

interface MfaCardProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

interface SetupData {
  secret: string;
  otpauthUrl: string;
}

export function MfaCard({ enabled, onChange }: MfaCardProps): React.JSX.Element {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call<T>(body: Record<string, string>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await clientFetch<T>("/api/auth/mfa", { method: "POST", body });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir a operação.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startSetup(): Promise<void> {
    const data = await call<SetupData>({ action: "setup" });
    if (data) setSetup(data);
  }

  async function confirm(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (await call({ action: "enable", code })) {
      setSetup(null);
      setCode("");
      onChange(true);
    }
  }

  async function disable(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (await call({ action: "disable", password, code })) {
      setPassword("");
      setCode("");
      onChange(false);
    }
  }

  const codeInput = (
    <div>
      <label htmlFor="mfaCode" className="block text-sm font-medium text-gray-700">Código do aplicativo</label>
      <input
        id="mfaCode"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className={`${inputClass} text-center font-mono tracking-[0.4em]`}
        placeholder="000000"
      />
    </div>
  );

  return (
    <div className="max-w-md rounded-lg border bg-white p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Verificação em duas etapas (2FA)</h2>
          <p className="text-sm text-gray-500">
            {enabled
              ? "Ativa: o login pede o código do aplicativo autenticador."
              : "Recomendado para administradores. Use Google Authenticator, Microsoft Authenticator ou similar."}
          </p>
        </div>
      </div>

      {!enabled && !setup && (
        <button
          type="button"
          onClick={startSetup}
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Gerando..." : "Ativar 2FA"}
        </button>
      )}

      {!enabled && setup && (
        <form onSubmit={confirm} className="space-y-4">
          <p className="text-sm text-gray-600">Escaneie o QR Code no aplicativo e digite o código gerado.</p>
          <div className="flex justify-center rounded-lg border bg-white p-4">
            <QRCodeSVG value={setup.otpauthUrl} size={176} level="M" />
          </div>
          <p className="break-all text-center font-mono text-xs text-gray-500">{setup.secret}</p>
          {codeInput}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Confirmando..." : "Confirmar e ativar"}
          </button>
        </form>
      )}

      {enabled && (
        <form onSubmit={disable} className="space-y-4">
          <div>
            <label htmlFor="mfaPassword" className="block text-sm font-medium text-gray-700">Senha atual</label>
            <input
              id="mfaPassword"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          {codeInput}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? "Desativando..." : "Desativar 2FA"}
          </button>
        </form>
      )}

      {error !== null && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
      )}
    </div>
  );
}
