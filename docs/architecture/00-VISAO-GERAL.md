# Alldav ERP — Visão Geral da Arquitetura

> **VISÃO-ALVO — não descreve a implementação atual.**
> A implementação em produção é um monolito Next.js (App Router) com Prisma sobre
> PostgreSQL/Supabase. Serviços separados, mensageria, cache distribuído e demais
> componentes citados aqui são objetivos de evolução, não o estado atual.

## 1. Contexto de Negócio

O **Alldav ERP** é um sistema de gestão integrado (ERP) projetado especificamente para lojas de moda feminina de alta performance no mercado brasileiro. O sistema garante que **estoque, frente de caixa (PDV) e financeiro** operem como um organismo único, eliminando ruídos de informação e maximizando a margem operacional.

### Premissas do Setor
- Um modelo gera até **15 SKUs** (5 tamanhos × 3 cores)
- Tamanhos M e G representam **~55% das vendas** e esgotam primeiro
- Markup médio do setor: **2.5 a 3.8**
- Giro de estoque ideal: **4 a 7 vezes/ano**
- Taxa de devolução e-commerce: **12% a 18%**
- Ciclo de coleção: **4 drops/ano** (verão, inverno, alto-verão, cruise)

---

## 2. Módulos do Sistema

| # | Módulo | Sigla | Responsabilidade Principal |
|---|--------|-------|---------------------------|
| 1 | Estoque e SKUs | `INV` | Cadastro de grade, RFID, Curva ABC, estoque de segurança |
| 2 | Compras, Sourcing e Produção | `PRC` | Matéria-prima, facção, controle de qualidade |
| 3 | Vendas e Jornada Omnichannel | `SAL` | PDV, e-commerce, click & collect, WhatsApp |
| 4 | Financeiro e Controladoria | `FIN` | Margem de contribuição, DRE, fluxo de caixa |
| 5 | Logística e Logística Reversa | `LOG` | Picking, packing, rastreio, devoluções |
| 6 | CRM e Retenção | `CRM` | LTV, ciclo de recompra, gatilhos automatizados |
| 7 | Dashboard e KPIs | `KPI` | Benchmarks, alertas, visão gerencial |

---

## 3. Princípios Arquiteturais

1. **Event-Driven Architecture (EDA)**: Todos os módulos se comunicam via eventos assíncronos, garantindo desacoplamento e resiliência.
2. **Single Source of Truth (SSOT)**: O estoque tem uma única fonte de verdade, replicada em tempo real para todos os canais.
3. **API-First**: Toda funcionalidade é exposta via API REST/GraphQL antes de ter interface.
4. **CQRS**: Separação de leitura e escrita para operações de alta concorrência (estoque omnichannel).
5. **Soft Delete**: Nenhum registro é removido fisicamente — tudo possui `deletedAt`.
6. **Audit Trail**: Toda operação de escrita gera log de auditoria com `userId`, `timestamp` e `payload`.

---

## 4. Stack Tecnológica Recomendada

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| Frontend Web | Next.js 15 + React 19 | SSR, performance, ecossistema |
| PDV Móvel | React Native / Expo | Compartilhamento de código com web |
| API Gateway | Kong / AWS API Gateway | Rate limiting, autenticação centralizada |
| Backend | Node.js (NestJS) | TypeScript end-to-end, alta produtividade |
| Banco Principal | PostgreSQL 16 | ACID, JSON, extensões analíticas |
| Cache / Real-time | Redis + Redis Streams | Estoque em tempo real, pub/sub |
| Fila de Eventos | Apache Kafka / Amazon SQS | Event sourcing, resiliência |
| Busca | Elasticsearch / Meilisearch | Catálogo, busca de produtos |
| Armazenamento | Amazon S3 / Cloudflare R2 | Imagens de produtos, fotos de devolução |
| Infraestrutura | AWS / Vercel | Escalabilidade, CDN global |
| ORM | Prisma | Type-safety, migrations, schema declarativo |
| Monitoramento | Grafana + Prometheus | Dashboards operacionais e de negócio |

---

## 5. Camadas da Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    CAMADA DE APRESENTAÇÃO                     │
│  PDV Móvel │ Admin Web │ E-commerce │ WhatsApp Bot │ Totem  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      API GATEWAY                             │
│        Auth │ Rate Limiting │ Routing │ Logging              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   CAMADA DE SERVIÇOS                         │
│  INV │ PRC │ SAL │ FIN │ LOG │ CRM │ KPI │ AUTH │ NOTIFY   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                 CAMADA DE EVENTOS (Kafka/SQS)                │
│    stock.updated │ order.placed │ payment.confirmed │ ...    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  CAMADA DE PERSISTÊNCIA                       │
│      PostgreSQL │ Redis │ Elasticsearch │ S3                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Mapa de Integração entre Módulos

| Evento | Origem | Consumidores |
|--------|--------|-------------|
| `stock.updated` | INV | SAL, LOG, KPI |
| `stock.low_alert` | INV | PRC, KPI, NOTIFY |
| `order.placed` | SAL | INV, FIN, LOG, CRM |
| `order.paid` | FIN | SAL, LOG, NOTIFY |
| `order.shipped` | LOG | SAL, CRM, NOTIFY |
| `return.requested` | SAL | LOG, INV, FIN |
| `return.inspected` | LOG | INV, FIN, CRM |
| `purchase.approved` | PRC | FIN, INV |
| `production.completed` | PRC | INV, LOG |
| `customer.milestone` | CRM | NOTIFY, SAL |

---

## 7. Requisitos Não-Funcionais

| Requisito | Meta | Justificativa |
|-----------|------|---------------|
| Latência de sincronização de estoque | < 200ms | Evitar venda negativa omnichannel |
| Disponibilidade | 99.9% (8.7h downtime/ano) | Operação de varejo contínua |
| RPO (Recovery Point Objective) | < 1 minuto | Dados financeiros críticos |
| RTO (Recovery Time Objective) | < 15 minutos | Minimizar impacto na operação |
| Throughput do PDV | > 500 transações/min | Black Friday e datas sazonais |
| Tempo de resposta da API | P95 < 300ms | UX de checkout fluida |
| Conformidade | LGPD, PAF-ECF, NF-e/NFC-e | Legislação brasileira |

---

## 8. Navegação dos Documentos

- [01 - Estoque e SKUs](./01-ESTOQUE-SKUS.md)
- [02 - Compras, Sourcing e Produção](./02-COMPRAS-SOURCING-PRODUCAO.md)
- [03 - Vendas e Jornada Omnichannel](./03-VENDAS-OMNICHANNEL.md)
- [04 - Financeiro e Controladoria](./04-FINANCEIRO-CONTROLADORIA.md)
- [05 - Logística e Logística Reversa](./05-LOGISTICA-REVERSA.md)
- [06 - CRM e Retenção](./06-CRM-RETENCAO.md)
- [07 - Dashboard e KPIs](./07-DASHBOARD-KPIS.md)
- [08 - Arquitetura Técnica](./08-ARQUITETURA-TECNICA.md)
