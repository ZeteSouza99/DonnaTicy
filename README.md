# DonnaTicy

Projeto base derivado da estrutura da Alldav, preparado para operar como um sistema independente, com banco, ambiente e branding próprios.

## Visão geral

Esta pasta foi criada como uma cópia funcional da estrutura principal, sem manter dependências e credenciais do projeto anterior. A ideia é manter uma base sólida em Next.js + Prisma + ERP de operação, mas com o ambiente da DonnaTicy isolado.

## Estrutura principal

- `src/` — app e lógica do sistema
- `prisma/` — schema e migrações
- `scripts/` — utilitários, seed e manutenção
- `public/` — arquivos públicos
- `tests/` — testes unitários e de integração
- `print-service/` — serviço local de impressão térmica

## Ambiente

1. Copie `.env.example` para `.env.local`.
2. Ajuste as credenciais reais do banco da DonnaTicy.
3. Defina `JWT_SECRET` (32 caracteres ou mais) e `MFA_ENCRYPTION_KEY`.
4. Em produção, defina também `CRON_SECRET` (16 caracteres ou mais). Sem ele o servidor não sobe, porque a manutenção diária depende dele.
5. Não versionar o `.env.local` real.

## Comandos

```bash
npm install
npm run db:generate
npm run dev
```

## Banco

- `DATABASE_URL` para runtime
- `DIRECT_DATABASE_URL` para migrações
- nunca reutilizar o banco da Alldav em produção da DonnaTicy
- `npm run build` não aplica migrações: rode `npm run db:deploy` contra o banco antes de publicar código que dependa delas

## Arquitetura

[docs/arquitetura.md](./docs/arquitetura.md) descreve o sistema como ele está hoje. Os arquivos em `docs/architecture/` são a visão-alvo herdada da Alldav e não descrevem a implementação atual.

## Branding

Os valores do branding da DonnaTicy já vêm como padrão em `src/lib/brand.ts` e em `.env.example`.

## Observação importante

Este projeto ainda precisa receber os secrets reais do ambiente da DonnaTicy antes de subir em produção ou testar com dados reais.
