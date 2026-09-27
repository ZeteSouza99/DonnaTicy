"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { clientFetch } from "@/lib/client-fetch";
import { MfaCard } from "./mfa-card";

const inputClass =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

interface AccountStatus {
  mustChangePassword: boolean;
  mfaEnabled: boolean;
}

export default function ContaPage(): React.ReactNode {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [status, setStatus] = useState<AccountStatus | null>(null);

  useEffect(() => {
    clientFetch<AccountStatus>("/api/auth/me").then(setStatus).catch(() => setStatus(null));
  }, []);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }

    setIsSaving(true);
    try {
      await clientFetch("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      if (status?.mustChangePassword) {
        // Recarrega o painel inteiro, agora liberado.
        window.location.assign("/dashboard");
        return;
      }
      setSuccess("Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar a senha.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/configuracoes" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Minha Conta</h1>
      </div>

      {status?.mustChangePassword && (
        <p className="max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Sua senha é provisória. Defina uma nova senha para liberar o acesso ao sistema.
        </p>
      )}

      <form onSubmit={handleSubmit} className="max-w-md rounded-lg border bg-white p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Alterar senha</h2>
            <p className="text-sm text-gray-500">
              Mínimo de 8 caracteres, com maiúscula, minúscula e número.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
              Senha atual
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
              Nova senha
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
              Confirmar nova senha
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {error !== null && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
        )}
        {success !== null && (
          <p className="mt-4 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">{success}</p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isSaving ? "Salvando..." : "Alterar senha"}
        </button>
      </form>

      {status && !status.mustChangePassword && (
        <MfaCard
          enabled={status.mfaEnabled}
          onChange={(mfaEnabled) => setStatus({ ...status, mfaEnabled })}
        />
      )}
    </div>
  );
}
