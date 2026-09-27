"use client";

import { Settings as SettingsIcon, Users, Store, Database, Tags, Palette, Ruler, Layers, Shirt, KeyRound } from "lucide-react";

export default function ConfiguracoesPage(): React.ReactNode {
  const sections = [
    {
      icon: KeyRound,
      title: "Minha Conta",
      description: "Alterar a senha de acesso do seu próprio usuário.",
      href: "/dashboard/configuracoes/conta",
    },
    {
      icon: Users,
      title: "Usuários",
      description: "Gerenciar operadores, gerentes e permissões de acesso.",
      href: "/dashboard/configuracoes/usuarios",
    },
    {
      icon: Store,
      title: "Locais / Lojas",
      description: "Configurar lojas, centros de distribuição e pontos de estoque.",
      href: "/dashboard/configuracoes/locais",
    },
    {
      icon: SettingsIcon,
      title: "Parâmetros Gerais",
      description: "Configurações de fidelidade, estoque, impostos e integrações.",
      href: "/dashboard/configuracoes/parametros",
    },
    {
      icon: Database,
      title: "Centros de Custo",
      description: "Gerenciar centros de custo para controle financeiro.",
      href: "/dashboard/configuracoes/centros-custo",
    },
    {
      icon: Tags,
      title: "Categorias",
      description: "Criar, renomear e excluir categorias do catálogo de produtos.",
      href: "/dashboard/configuracoes/categorias",
    },
    {
      icon: Palette,
      title: "Cores",
      description: "Gerenciar as cores disponíveis para as variantes de produtos.",
      href: "/dashboard/configuracoes/cores",
    },
    {
      icon: Ruler,
      title: "Tamanhos",
      description: "Gerenciar a grade de tamanhos das variantes de produtos.",
      href: "/dashboard/configuracoes/tamanhos",
    },
    {
      icon: Layers,
      title: "Coleções",
      description: "Gerenciar coleções sazonais do catálogo de produtos.",
      href: "/dashboard/configuracoes/colecoes",
    },
    {
      icon: Shirt,
      title: "Linhas",
      description: "Gerenciar linhas de produto do catálogo.",
      href: "/dashboard/configuracoes/linhas",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <a
            key={section.title}
            href={section.href}
            className="group flex items-start gap-4 rounded-lg border bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 group-hover:bg-brand-200">
              <section.icon size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{section.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{section.description}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
