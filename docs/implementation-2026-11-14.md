# Revisão da DonnaTicy — 14/11/2026

Implementação no repositório. Não houve publicação nem alteração do banco operacional.

## Interface

- Dashboard com quatro indicadores principais, períodos comparáveis, filtro por local, gráfico diário, produtos mais vendidos, canais, alertas e meta configurável.
- Tipografia do sistema operacional, sem baixar fontes do Google durante o build. Mantida a identidade oliva, branco e dourado.
- Menu lateral compacto, preferência de recolhimento, busca global funcional e acesso à conta pelo cabeçalho.
- Navegação inferior para celular e tablet, área segura para dispositivos com indicador de início e ação de pagamento fixa no PDV.
- Cartões responsivos no catálogo, estoque e tabelas compartilhadas. Ações de criação ficam acessíveis no rodapé dos principais formulários.
- Foco confinado nos diálogos, saída com Escape, retorno ao acionador e menu fechado fora da navegação por teclado no mobile.
- Carrinho persistido por usuário na aba, com validade de 24 horas. Clientes são pesquisados no servidor, sem o limite anterior dos primeiros 200.
- Filtros e relatórios com tratamento explícito de erro; impressão A4 separada do comprovante térmico de 80 mm.

## Consistência das operações

Vendas e trocas do PDV enviam `Idempotency-Key`. O backend trava essa chave por usuário/operação, valida o hash do conteúdo e grava a resposta na mesma transação que estoque e financeiro. Reenvio concorrente retorna a operação original. A API de criação de devolução também aceita essa chave. Clientes antigos sem a chave continuam compatíveis, mas não recebem essa proteção adicional.

Descontos são distribuídos pelos itens, preservando centavos. Pedidos antigos com itens sem desconto são recalculados para a consulta do saldo de devolução. Trocas e devoluções abertas disputam o mesmo saldo de quantidade. O cálculo monetário considera apenas quantidades já concluídas; isso evita repetir o centavo residual em solicitações abertas simultaneamente.

Uma devolução resolvida em vale cria um `StoreCredit` vinculado unicamente à solicitação. O mesmo processamento não repõe estoque nem emite crédito duas vezes. A validade vem dos parâmetros operacionais. Cliente genérico não recebe vale.

Pedidos remotos ainda em PAID só têm reserva: devolução/troca é recusada até a saída física em PICKING. O usuário pode cancelar o pedido antes disso. A regra evita repor peças que ainda não saíram.

## Indicadores

| Visão | Critério |
|---|---|
| Dashboard e relatório de vendas | Pedidos confirmados, excluindo PENDING_PAYMENT, CANCELLED e removidos |
| Comparação mensal | Mesmo dia e horário do mês anterior, limitado ao último dia desse mês |
| Datas explícitas | Início e fim do dia no APP_TIMEZONE; padrão America/Manaus |
| Estoque mínimo | Físico menos reservado, local ativo, filtro e paginação no banco |
| DRE | Lançamentos por competência, CMV dos itens e estornos/restituições do período |
| Cancelamento | Mantém a receita recebida na competência original e reconhece o reembolso e a reversão de CMV na data do cancelamento |
| Vales de devolução | Dedução no resultado na emissão; não são confirmação de reembolso bancário |

A margem de vendas mede a carteira de pedidos selecionada. A DRE incorpora eventos de períodos diferentes, lançamentos manuais, devoluções e trocas, portanto não é necessariamente igual à margem comercial. A tela financeira informa quais parcelas são calculadas; agrupamentos e CSV continuam mostrando os lançamentos registrados.

O comportamento anterior de tratar uso de vale como redução do total a pagar foi preservado. Não houve reclassificação contábil retroativa. Trocas antigas não guardavam custo dos itens novos: para elas o CMV usa o custo atual do produto; novas trocas guardam o custo no momento da operação. Custos históricos ausentes não podem ser reconstruídos com precisão sem uma fonte externa.

## Importações

Cada envio possui hash, usuário, progresso, resumo e estado PENDING/RUNNING/FAILED/COMPLETED. A interface avança uma nota por chamada. Nota, itens, estoque, auditoria e progresso são confirmados juntos. Uma falha desfaz a nota em processamento; notas anteriores permanecem salvas e ficam indicadas no progresso.

O mesmo arquivo reenviado retorna o job existente. Uma nota que já tenha itens é bloqueada mesmo em outro arquivo, para evitar entrada duplicada. A retomada é explícita para jobs falhos. A manutenção diária também avança jobs pendentes dentro de uma janela de processamento; não existe serviço de fila externo nem garantia de conclusão imediata após fechar a página.

Limites: .xlsx, 10 MB, 5.000 linhas e 200 linhas por nota. O destino segue a convenção existente de local MATRIZ e coleção/linha DEFAULT. Arquivos com erros de parse precisam ser corrigidos antes da importação real. A validação não altera catálogo nem estoque, mas registra o job e a auditoria.

## CRM e parâmetros

Parâmetros configuráveis: meta mensal, janela de cliente ativo e validade de novos vales. Alteração exige `settings/manage` e é auditada.

O executor interno suporta aniversário, prazo sem compra/recompra, valor acumulado e pós-entrega. Pode criar tarefas, conceder pontos e elevar categoria. Respeita intervalo e limite por cliente, usa transações e registra execução. A interface permite criar/pausar regras, executar manualmente e concluir tarefas. Cada execução processa até 100 regras compatíveis e 50 clientes por regra.

WhatsApp, e-mail, SMS e condições sem executor não são tratados como envios realizados. Dependem de implementação/configuração do provedor e das autorizações de comunicação. Nenhuma mensagem externa foi enviada nesta implementação. Emissão fiscal, gateways e conciliação bancária também continuam dependendo de integrações reais.

## Migração e publicação

A migração `20261114000100_operations_and_import_jobs` acrescenta registros de idempotência, jobs, tarefas do CRM e vínculo de vale com devolução; não apaga dados existentes.

Antes de publicar esta versão no ambiente operacional:

1. Aplicar `npm run db:deploy` usando o `DIRECT_DATABASE_URL` desse ambiente.
2. Confirmar `CRON_SECRET` e o cron `/api/maintenance` do `vercel.json`.
3. Gerar/publicar o build e configurar os parâmetros em Configurações → Parâmetros.

O build não executa migrações. As validações desta implementação usaram PostgreSQL descartável em loopback; nenhum teste utiliza a base real. As contas de teste pertencem exclusivamente a esses bancos temporários.

## Validação

- Testes unitários, verificação de tipos, ESLint e build de produção.
- Integração com migrações em banco vazio, legado e parcial; comparação de schema sem diferenças.
- Cenários adicionais: venda concorrente idempotente, conflito de chave, desconto em devolução, saldo compartilhado, emissão única de vale, arredondamento com várias solicitações abertas, estoque disponível por local, health sem efeitos, cron autenticado, CRM com intervalo/limite e retomada de importação.
- Navegador: login, dashboard, busca global, recuperação do carrinho após recarregar, venda em dinheiro, registro no histórico, catálogo em cartões e navegação inferior.
- Larguras verificadas: desktop, 390 px e 320 px. Os dados das capturas são do banco descartável.

Prévia de referência: [dashboard mobile](./qa/dashboard-mobile.jpg).
