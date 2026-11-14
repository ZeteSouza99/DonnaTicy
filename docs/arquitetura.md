# Arquitetura da DonnaTicy

A DonnaTicy é um monólito Next.js (App Router) com Prisma sobre PostgreSQL. Um único projeto contém as telas, a API e as regras de negócio. O deploy é na Vercel, região `gru1`, com banco PostgreSQL no Neon.

Os arquivos em [architecture/](./architecture/) descrevem uma visão-alvo herdada da Alldav (serviços separados, mensageria, cache distribuído). Nada daquilo existe aqui.

## Caminho de uma requisição

1. [src/proxy.ts](../src/proxy.ts) confere a assinatura do JWT no cookie `session`, aplica a matriz de permissões pelo prefixo da URL e injeta `x-request-id`.
2. Páginas em `src/app/dashboard/` são client components que buscam dados em `/api` com [client-fetch.ts](../src/lib/client-fetch.ts). O layout do dashboard roda no servidor e barra sessão revogada e senha provisória.
3. Cada rota em `src/app/api/` chama `requirePermission(request, recurso, ação)`, valida o corpo com um schema Zod de `src/schemas/`, acessa o banco pelo Prisma e devolve erros por `handleApiError`.

O proxy só confere a assinatura do token. Revogação (logout, troca de senha, desativação) é verificada nos handlers e no layout, que consultam o banco.

## Autorização

[src/lib/permissions.ts](../src/lib/permissions.ts) tem a matriz papel × recurso × ação (`read`, `write`, `manage`). O proxy, os handlers e o menu lateral usam a mesma matriz. Um recurso novo precisa entrar nela e nos dois mapas de prefixo do mesmo arquivo.

## Regras de negócio

A maior parte das rotas fala direto com o Prisma. Os fluxos que mexem em várias tabelas na mesma transação ficam em `src/services/`:

| Arquivo | Responsabilidade |
|---|---|
| `order-service.ts` | Criação do pedido: itens, estoque, cupom, desconto, vale-troca, pagamentos, receita e auditoria |
| `order-status-service.ts` | Transições de status, baixa de pagamento e cancelamento com estorno |
| `financial-entry-service.ts` | Edição e exclusão de lançamentos financeiros |
| `maintenance-service.ts` | Coordena limpeza, expiração, CRM e importações |
| `idempotency-service.ts` | Confirma cada chave de operação uma vez, junto dos efeitos no banco |
| `return-balance-service.ts` | Saldo compartilhado por trocas e devoluções, com reserva e quantidade já resolvida |
| `reporting-service.ts` | Critérios de vendas confirmadas, CMV histórico e resultado financeiro |
| `stock-query-service.ts` | Filtro e contagem de estoque mínimo no PostgreSQL |
| `import-job-service.ts` | Arquivo identificado por hash, processamento por nota e retomada |
| `automation-service.ts` | Regras internas do CRM, intervalo e limite por cliente |
| `settings-service.ts` | Parâmetros operacionais persistidos |
| `stock-lock.ts`, `order-lock.ts` | Travas de estoque e de pedido |

### Estoque

Cada posição (`stock_positions`) tem o saldo físico (`quantity`) e o reservado (`reserved_qty`). O saldo vendável é a diferença entre os dois.

- Venda de balcão (`STORE`) baixa o físico na hora e o pedido já nasce `DELIVERED`.
- Os outros canais reservam. A reserva vira baixa física quando o pedido entra em `PICKING`.
- Venda de balcão, troca e movimentação manual usam `deductAvailableStock`, que só retira do saldo vendável.
- Operações com mais de uma posição chamam `lockStockPositions` antes de escrever. Ele trava as posições sempre na mesma ordem, o que evita deadlock entre venda, cancelamento, troca e devolução.
- O banco recusa `quantity < 0` e `reserved_qty` fora do intervalo de 0 a `quantity` (CHECK criado na migração `20261110000100_stock_position_checks`).

### Pedido

```
PENDING_PAYMENT → PAID → PICKING → PACKED → SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
```

`PENDING_PAYMENT`, `PAID` e `PICKING` aceitam cancelamento. O cancelamento devolve estoque ou reserva, cancela a receita pendente, registra a obrigação de reembolso do que já foi recebido e restitui cupom e vale-troca. Pedido remoto sem pagamento confirmado em `PENDING_ORDER_TTL_HOURS` (48 por padrão) é cancelado pelo cron.

### Dinheiro

As colunas monetárias são `DECIMAL(12,2)`. A criação do pedido e a troca fazem as contas em centavos inteiros ([src/lib/money.ts](../src/lib/money.ts)) e gravam valores já fechados, de modo que subtotal menos descontos é igual ao total. Diferença de até um centavo é aceita entre pagamentos e total e entre os dois lados de uma troca. Descontos são rateados pelos itens em centavos. Trocas e devoluções compartilham o saldo da quantidade; somente as já concluídas entram no rateio monetário acumulado. Assim, várias solicitações abertas não recebem o mesmo centavo de arredondamento. O cancelamento mantém a receita recebida e lança a obrigação de reembolso na competência correta.

Não há integração com gateway de pagamento. Os pagamentos são registrados com gateway `INTERNAL` e a baixa de pedidos remotos é manual.

## Autenticação

[src/lib/auth.ts](../src/lib/auth.ts) emite um JWT HS256 em cookie `httpOnly`, com validade definida por `JWT_EXPIRES_IN`. O token carrega `tokenVersion` (invalida todas as sessões do usuário) e `jti` (revoga uma sessão no logout). O login tem limite de tentativas por IP e por e-mail gravado no Postgres, bloqueio progressivo da conta e TOTP opcional.

## Ambiente e tarefas agendadas

[src/lib/env.ts](../src/lib/env.ts) valida as variáveis do servidor na subida. Configuração inválida impede o servidor de iniciar. `CRON_SECRET` é obrigatório em produção. `APP_TIMEZONE` (padrão `America/Manaus`) é o fuso da loja: os KPIs do dashboard e o período padrão do resumo e do relatório financeiro viram o mês nesse fuso, e não no do servidor, que na Vercel é UTC.

A Vercel chama `GET /api/maintenance` todo dia às 12:00 UTC ([vercel.json](../vercel.json)). A rota exige `Authorization: Bearer <CRON_SECRET>` em todos os ambientes. Executa expiração de pedidos e vales, limpeza, automações internas e avanço de importações pendentes. Falhas de etapas são registradas em logs estruturados e a resposta é 503 quando uma etapa falha. `GET /api/health` apenas verifica a conexão, sem alterar registros.

## Banco e migrações

O schema está em [prisma/schema.prisma](../prisma/schema.prisma) e as migrações em `prisma/migrations/`. A aplicação usa `DATABASE_URL` (endpoint com pooler) e o Prisma Migrate usa `DIRECT_DATABASE_URL` (endpoint direto), porque o pooler em modo transação trava os comandos do Migrate.

`npm run build` não aplica migrações. Rode `npm run db:deploy` antes de publicar código que dependa de uma migração nova.

## Fora do Next.js

- [print-service/](../print-service/) é um servidor Express que roda no computador do caixa, em `127.0.0.1:5555`, e envia ESC/POS para a impressora térmica. O PDV só o chama quando `NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING` é `true`. Se o serviço não responde, o comprovante sai por `window.print()`.
- O QR Code Pix da mensalidade do sistema é montado no navegador por [src/lib/pix.ts](../src/lib/pix.ts), sem chamada a banco ou gateway.

## Testes e CI

- `npm test` roda os testes unitários de `tests/`.
- `npm run test:integration` sobe um PostgreSQL descartável em loopback, aplica as migrações, confere que o schema não divergiu e chama os handlers reais contra esse banco. Nenhum banco externo é usado.
- O CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) roda lint, checagem de tipos, os dois conjuntos de testes e o build em cada push e pull request para `main`.

## Interface e mobile

`DashboardShell` fornece a sessão validada ao cabeçalho, menu e páginas. Em telas com menos de 1024 px, `MobileNav` mostra Início, Produtos, Vender, Clientes e Mais conforme as permissões. O PDV mantém o pagamento acima dessa navegação, respeitando a área segura do aparelho. Tabelas compartilhadas viram cartões em telas menores que 640 px.

`useApiQuery` cancela requisições anteriores e preserva o último resultado durante uma atualização. O PDV separa carrinho, busca de cliente e confirmação da operação. O carrinho fica no armazenamento da aba por até 24 horas; uma confirmação incerta conserva a chave e o conteúdo da venda para consultar novamente sem duplicar efeitos.

Veja o [registro da implementação e dos limites conhecidos](./implementation-2026-11-14.md).
