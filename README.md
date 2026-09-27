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
3. Defina `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, SMTP, S3, Stripe e Pix.
4. Não versionar o `.env.local` real.

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

## Branding

Os valores do branding da DonnaTicy já vêm como padrão em `src/lib/brand.ts` e em `.env.example`.

## Observação importante

Este projeto ainda precisa receber os secrets reais do ambiente da DonnaTicy antes de subir em produção ou testar com dados reais.
