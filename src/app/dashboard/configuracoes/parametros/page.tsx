"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Construction } from "lucide-react";

export default function ParametrosPage(): React.ReactNode {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/configuracoes")} className="rounded-lg p-2 hover:bg-gray-100" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Parâmetros Gerais</h1>
      </div>

      <div className="flex flex-col items-center justify-center rounded-lg border bg-white py-20">
        <Construction className="mb-4 h-12 w-12 text-gray-300" />
        <h2 className="text-lg font-semibold text-gray-500">Em Construção</h2>
        <p className="mt-1 text-sm text-gray-400">As configurações de fidelidade, estoque, impostos e integrações serão disponibilizadas em breve.</p>
      </div>
    </div>
  );
}
