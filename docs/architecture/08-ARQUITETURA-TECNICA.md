# Módulo 08 — Arquitetura Técnica de Sistemas

> **VISÃO-ALVO — não descreve a implementação atual.** Ver `00-VISAO-GERAL.md`.

## 8.1 Visão em Camadas

### Camadas da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  CAMADA 1: INTERFACE DE VENDA (PDV Móvel)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ React Native / Expo                                                 │    │
│  │ • PDV Touchscreen (tablet)     • Scanner RFID / Barcode            │    │
│  │ • Modo offline (SQLite local)  • Impressora térmica (NFC-e)        │    │
│  │ • Sync automático ao reconectar                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CAMADA 2: EXPERIÊNCIA ONLINE (E-commerce + WhatsApp)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Next.js 15 (App Router)                                             │    │
│  │ • Storefront SSR/ISR          • Checkout SPA                       │    │
│  │ • Admin Panel (backoffice)    • WhatsApp Bot (Node.js worker)      │    │
│  │ • CDN (Vercel Edge / CF)      • Payment Links                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CAMADA 3: API GATEWAY                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Kong / AWS API Gateway                                              │    │
│  │ • Autenticação (JWT / OAuth2) • Rate Limiting                      │    │
│  │ • Request/Response Logging    • SSL Termination                    │    │
│  │ • Routing por versão (v1, v2)  • CORS                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CAMADA 4: CORE MANAGEMENT (ERP Central)                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ NestJS (Node.js + TypeScript)                                       │    │
│  │                                                                     │    │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │    │
│  │ │   INV   │ │   PRC   │ │   SAL   │ │   FIN   │ │   CRM   │      │    │
│  │ │Inventory│ │Purchase │ │  Sales  │ │Financial│ │Customer │      │    │
│  │ │ Module  │ │ Module  │ │ Module  │ │ Module  │ │ Module  │      │    │
│  │ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘      │    │
│  │                                                                     │    │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐                  │    │
│  │ │   LOG   │ │   KPI   │ │  AUTH   │ │  NOTIFY  │                  │    │
│  │ │Logistics│ │Analytics│ │  Auth   │ │Notificat.│                  │    │
│  │ │ Module  │ │ Module  │ │ Module  │ │  Module  │                  │    │
│  │ └─────────┘ └─────────┘ └─────────┘ └──────────┘                  │    │
│  │                                                                     │    │
│  │ ORM: Prisma │ Validation: Zod │ Queue: BullMQ                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CAMADA 5: CUSTOMER INTELLIGENCE (CRM + CDP)                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Segmentação RFM automatizada     • Motor de triggers/automações  │    │
│  │ • Cálculo de LTV / churn           • A/B testing de campanhas      │    │
│  │ • Pipeline de enriquecimento       • Integração WhatsApp Cloud API │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CAMADA 6: OPERAÇÃO LOGÍSTICA (WMS)                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ • Picking otimizado por rota       • Conferência com scanner       │    │
│  │ • Packing por tipo de pedido       • Geração de etiquetas (APIs)   │    │
│  │ • Tracking status (webhook)        • Logística reversa automatizada│    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CAMADA 7: BARRAMENTO DE EVENTOS                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Apache Kafka / Amazon SQS + SNS / Redis Streams                     │    │
│  │ • Event sourcing para estoque     • Pub/Sub entre módulos          │    │
│  │ • Dead letter queue (DLQ)         • Retry com backoff exponencial  │    │
│  │ • Event replay para debugging     • Ordenação por partição         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  CAMADA 8: PERSISTÊNCIA                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ ┌───────────┐  ┌─────────┐  ┌────────────┐  ┌─────────┐           │    │
│  │ │PostgreSQL │  │  Redis  │  │Elasticsearch│  │Amazon S3│           │    │
│  │ │  (OLTP)   │  │ (Cache +│  │  (Search)   │  │(Objetos)│           │    │
│  │ │           │  │ Pub/Sub)│  │             │  │         │           │    │
│  │ │• Dados    │  │• Stock  │  │• Catálogo   │  │• Imagens│           │    │
│  │ │  transac. │  │  cache  │  │• Full-text  │  │• Fotos  │           │    │
│  │ │• ACID     │  │• Session│  │• Analytics  │  │• Docs   │           │    │
│  │ │• Audit log│  │• Queue  │  │• Logs       │  │• Backup │           │    │
│  │ └───────────┘  └─────────┘  └────────────┘  └─────────┘           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8.2 Integrações Externas

### Mapa de APIs de Terceiros

```
┌──────────────────────────────────────────────────────┐
│                   Alldav ERP                          │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │              API GATEWAY                         │  │
│  └──────────┬──────────┬──────────┬────────────────┘  │
│             │          │          │                    │
└─────────────┼──────────┼──────────┼────────────────────┘
              │          │          │
    ┌─────────▼──┐  ┌────▼────┐  ┌─▼──────────┐
    │ FISCAL     │  │PAGAMENTO│  │ LOGÍSTICA  │
    │            │  │         │  │            │
    │ SEFAZ      │  │ Pagar.me│  │ Correios   │
    │ (NF-e,     │  │ Stone   │  │ Jadlog     │
    │  NFC-e)    │  │ Cielo   │  │ Loggi      │
    │            │  │ Pix BCB │  │ Kangu      │
    │ Prefeitura │  │         │  │ Melhor     │
    │ (NFS-e)    │  │         │  │ Envio      │
    └────────────┘  └─────────┘  └────────────┘

    ┌────────────┐  ┌─────────┐  ┌────────────┐
    │ COMUNICAÇÃO│  │   RFID  │  │MARKETPLACE │
    │            │  │         │  │            │
    │ WhatsApp   │  │ Zebra   │  │ Mercado    │
    │ Cloud API  │  │ Impinj  │  │ Livre      │
    │            │  │ SATO    │  │            │
    │ SendGrid/  │  │         │  │ Shopee     │
    │ Resend     │  │         │  │            │
    │ (email)    │  │         │  │ Amazon     │
    │            │  │         │  │            │
    │ Twilio     │  │         │  │ Shein      │
    │ (SMS)      │  │         │  │            │
    └────────────┘  └─────────┘  └────────────┘
```

### Detalhamento das Integrações

| Sistema | Protocolo | Autenticação | Frequência | Criticidade |
|---------|-----------|-------------|-----------|-------------|
| SEFAZ (NF-e/NFC-e) | SOAP/XML | Certificado Digital A1 | Tempo real (cada venda) | 🔴 Crítica |
| Gateway de pagamento | REST/JSON | API Key + Webhook | Tempo real | 🔴 Crítica |
| Correios (SIGEP) | SOAP/XML | Usuário/Senha | Por despacho | 🟡 Alta |
| Transportadoras | REST/JSON | API Key | Por despacho + tracking | 🟡 Alta |
| WhatsApp Cloud API | REST/JSON | Bearer Token (Meta) | Tempo real | 🟡 Alta |
| RFID Middleware | TCP/UDP | Rede local | Tempo real | 🟡 Alta |
| Marketplaces | REST/JSON | OAuth2 | Polling 5min + webhook | 🟡 Alta |
| Email (SendGrid) | REST/JSON | API Key | Assíncrono (fila) | 🟢 Média |
| SMS (Twilio) | REST/JSON | Account SID + Token | Assíncrono (fila) | 🟢 Média |

---

## 8.3 Segurança

### Autenticação e Autorização

```
MODELO DE SEGURANÇA:

1. AUTENTICAÇÃO:
   - Backoffice/Admin: Email + Senha + MFA (TOTP)
   - PDV: PIN numérico (6 dígitos) + fingerprint do dispositivo
   - E-commerce (clientes): Email + Senha OU Social Login (Google)
   - API: JWT (access token 15min + refresh token httpOnly cookie 7d)
   
2. AUTORIZAÇÃO (RBAC):
   Roles:
   - SUPER_ADMIN:    Acesso total
   - STORE_MANAGER:  Gerência da loja + relatórios
   - SELLER:         PDV + consulta estoque + CRM básico
   - BUYER:          Compras + fornecedores + produção
   - WAREHOUSE:      Estoque + recebimento + expedição
   - FINANCE:        Financeiro + relatórios
   - MARKETING:      CRM + campanhas + dashboard
   - ECOM_ADMIN:     E-commerce + catálogo
   - VIEWER:         Somente leitura (investidores, consultores)

3. POLÍTICAS:
   - Tokens NUNCA em localStorage → httpOnly cookies
   - Refresh token rotation (single use)
   - Rate limiting: 100 req/min por IP, 1000 req/min por usuário
   - Brute force protection: lock após 5 tentativas (15min)
   - Logs de acesso: quem, quando, o quê, de onde (IP + device)
```

### LGPD — Conformidade

```
MEDIDAS DE CONFORMIDADE COM A LGPD:

1. CONSENTIMENTO:
   - Opt-in explícito para WhatsApp, Email, SMS
   - Registro de consentimento: data, canal, versão dos termos
   
2. DIREITOS DO TITULAR:
   - Módulo "Meus Dados" no e-commerce:
     • Visualizar dados pessoais coletados
     • Solicitar correção
     • Solicitar exclusão (anonimização)
     • Portabilidade (export JSON/CSV)
     • Revogar consentimento
   
3. ARMAZENAMENTO:
   - Dados sensíveis encriptados em repouso (AES-256)
   - CPF parcialmente mascarado em telas (***.***.XXX-XX)
   - Logs de auditoria imutáveis (append-only)
   
4. RETENÇÃO:
   - Dados fiscais: 5 anos (obrigação legal)
   - Dados de clientes inativos: anonimizar após 2 anos
   - Logs de acesso: 1 ano
```

---

## 8.4 Infraestrutura e Deploy

### Ambiente Recomendado

```
PRODUÇÃO:

┌─────────────────────────────────────────────────────────┐
│                     AWS / Vercel                         │
│                                                          │
│  Frontend (E-commerce):                                  │
│    Vercel (Next.js) → Edge CDN global                    │
│                                                          │
│  Backend (NestJS):                                       │
│    AWS ECS Fargate (containers) OU                       │
│    AWS Lambda (serverless para módulos específicos)      │
│                                                          │
│  Banco de Dados:                                         │
│    AWS RDS PostgreSQL (Multi-AZ, read replicas)          │
│    AWS ElastiCache Redis (cluster)                       │
│                                                          │
│  Mensageria:                                             │
│    Amazon MSK (Kafka gerenciado) OU                      │
│    Amazon SQS + SNS (mais simples)                       │
│                                                          │
│  Armazenamento:                                          │
│    Amazon S3 + CloudFront (imagens, documentos)          │
│                                                          │
│  Busca:                                                  │
│    Amazon OpenSearch (Elasticsearch gerenciado)           │
│                                                          │
│  Monitoramento:                                          │
│    Grafana Cloud + Prometheus                            │
│    Sentry (error tracking)                               │
│    AWS CloudWatch (infra)                                │
│                                                          │
│  CI/CD:                                                  │
│    GitHub Actions → Docker → ECR → ECS                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Estratégia de Deploy

```
PIPELINE CI/CD:

main (produção)
  │
  ├── staging (homologação)
  │     │
  │     └── feature/* (desenvolvimento)
  │
  └── hotfix/* (correções emergenciais)

FLUXO:
1. Developer abre PR para staging
2. CI: Lint + Type Check + Unit Tests + Integration Tests
3. Code Review (min 1 aprovação)
4. Merge → Deploy automático em staging
5. QA manual em staging
6. PR de staging → main
7. Deploy automático em produção (blue-green)
8. Health check automático (rollback se falhar)
```

---

## 8.5 Escalabilidade — Projeção de Carga

### Estimativas para 10 Lojas + E-commerce

| Métrica | Volume Estimado | Pico (Black Friday) |
|---------|----------------|---------------------|
| Requisições API/dia | 500.000 | 3.000.000 |
| Transações de venda/dia | 2.000 | 10.000 |
| Atualizações de estoque/dia | 15.000 | 80.000 |
| Usuários simultâneos (e-com) | 500 | 5.000 |
| Eventos no message broker/dia | 100.000 | 500.000 |
| Armazenamento (DB) ao ano | ~50 GB | — |
| Armazenamento (S3) ao ano | ~200 GB | — |

### Estratégias de Escalabilidade

```
HORIZONTAL:
- Backend: Auto-scaling de containers (ECS) baseado em CPU/Memory
- DB: Read replicas para queries pesadas (relatórios, KPIs)
- Cache: Redis Cluster para stock reads
- Event broker: Kafka partitions por módulo

VERTICAL:
- DB: Upgrade de instância RDS se necessário
- Evitar: migrar para banco mais robusto como CockroachDB somente se > 50 lojas
```

---

## 8.6 Observabilidade

### Pilares

```
1. LOGS (Structured JSON):
   {
     "timestamp": "2027-04-13T10:30:00Z",
     "level": "info",
     "service": "inventory-service",
     "traceId": "abc123",
     "message": "Stock updated",
     "data": { "variantId": "...", "oldQty": 10, "newQty": 9 }
   }
   → Centralizados no Elasticsearch/CloudWatch

2. MÉTRICAS (Prometheus):
   - http_request_duration_seconds (por rota)
   - stock_sync_latency_ms
   - orders_placed_total (por canal)
   - payment_processing_time_ms
   - queue_depth (por tópico)

3. TRACES (OpenTelemetry):
   - Trace distribuído entre serviços
   - Visualização no Grafana Tempo / Jaeger
   - Identificação de gargalos end-to-end
```

---

## 8.7 Diagrama de Contexto (C4 — Nível 1)

```
                    ┌─────────────┐
                    │   Cliente    │
                    │  (Comprador) │
                    └──────┬──────┘
                           │ Compra, troca, consulta
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐     ┌──────▼──────┐   ┌──────▼──────┐
    │ E-COM   │     │    PDV      │   │  WhatsApp   │
    │ (Site)  │     │  (Tablet)   │   │  (Bot/Chat) │
    └────┬────┘     └──────┬──────┘   └──────┬──────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                    ┌──────▼──────┐
                    │             │
                    │   Alldav   │
                    │    ERP     │
                    │             │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐     ┌──────▼──────┐   ┌──────▼──────┐
    │  SEFAZ  │     │  Gateways   │   │Transportad. │
    │ (Fiscal)│     │ (Pagamento) │   │ (Logística) │
    └─────────┘     └─────────────┘   └─────────────┘

         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐     ┌──────▼──────┐   ┌──────▼──────┐
    │  RFID   │     │  WhatsApp   │   │ Marketplaces│
    │Hardware │     │  Cloud API  │   │  (ML, Shp)  │
    └─────────┘     └─────────────┘   └─────────────┘
```

---

## 8.8 Modelo de Dados — Visão Consolidada

### Diagrama Entidade-Relacionamento (Simplificado)

```
Collection ──< Product ──< ProductVariant ──< StockPosition
                │                │                  │
                │                │             Location
                │                │
            ProductBOM      OrderItem ──── Order ──── Customer
                │                              │          │
           RawMaterial                    Payment    LoyaltyPoints
                │                              │          │
            Supplier                    FinancialEntry  AutomationExecution
                │                                         │
         ProductionOrder                            AutomationTrigger
                │
      ProductionOrderItem
      
      ReturnRequest ──< ReturnRequestItem
           │
         Order
```

### Contagem Estimada de Tabelas

| Domínio | Tabelas | Exemplos |
|---------|---------|----------|
| Catálogo | ~10 | Product, ProductVariant, Collection, Line, Category, Color, Size, ProductBOM |
| Estoque | ~6 | StockPosition, StockMovement, StockReservation, Location, InventoryCount |
| Compras | ~6 | PurchaseRequest, PurchaseOrder, PurchaseOrderItem, Supplier, SupplierEval |
| Produção | ~4 | ProductionOrder, ProductionOrderItem, QualityInspection, RawMaterial |
| Vendas | ~8 | Order, OrderItem, Cart, CartItem, PaymentLink, Coupon, Promotion |
| Financeiro | ~6 | PaymentTransaction, FinancialEntry, CostCenter, BankAccount, Receivable |
| Logística | ~6 | Shipment, ShipmentItem, ReturnRequest, ReturnRequestItem, Carrier |
| CRM | ~6 | Customer, CustomerAddress, LoyaltyTransaction, AutomationTrigger, AutomationExecution |
| Auth | ~4 | User, Role, Permission, Session |
| Sistema | ~4 | AuditLog, Notification, Setting, EventLog |
| **Total** | **~60** | |
