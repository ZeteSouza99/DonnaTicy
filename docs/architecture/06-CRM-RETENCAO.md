# Módulo 06 — CRM e Retenção (`CRM`)

> **VISÃO-ALVO — não descreve a implementação atual.** Ver `00-VISAO-GERAL.md`.

## 6.1 Customer Data Platform (CDP)

### Entidade: Customer

```
Customer {
  id                UUID (PK)
  code              VARCHAR(20) UNIQUE       -- "CLI-000001"
  
  -- Dados Pessoais
  fullName          VARCHAR(200)
  email             VARCHAR(255) UNIQUE NULL
  phone             VARCHAR(20) UNIQUE
  cpf               VARCHAR(11) UNIQUE NULL
  birthDate         DATE NULL
  gender            ENUM NULL               -- FEMALE, MALE, NON_BINARY, PREFER_NOT_SAY
  
  -- Segmentação
  tier              ENUM DEFAULT 'BRONZE'   -- BRONZE, SILVER, GOLD, VIP
  lifetimeValue     DECIMAL(12,2) DEFAULT 0 -- LTV acumulado
  totalOrders       INTEGER DEFAULT 0
  avgTicket         DECIMAL(10,2) DEFAULT 0
  lastPurchaseAt    TIMESTAMP NULL
  firstPurchaseAt   TIMESTAMP NULL
  
  -- Preferências detectadas (calculadas automaticamente)
  preferredSizes    JSONB NULL              -- {"top": "M", "legging": "M", "short": "P"}
  preferredColors   JSONB NULL              -- [{"color": "Preto", "pct": 62}, {"color": "Marinho", "pct": 23}]
  preferredCategory JSONB NULL              -- [{"cat": "Leggings", "pct": 45}, {"cat": "Tops", "pct": 30}]
  
  -- Ciclo de Recompra
  avgRepurchaseDays INTEGER NULL            -- Intervalo médio entre compras (dias)
  nextPurchaseEst   DATE NULL               -- Estimativa da próxima compra
  churnRisk         ENUM NULL               -- LOW, MEDIUM, HIGH, CHURNED
  
  -- Fidelidade
  loyaltyPoints     INTEGER DEFAULT 0
  
  -- Opt-in
  whatsappOptIn     BOOLEAN DEFAULT false
  emailOptIn        BOOLEAN DEFAULT false
  smsOptIn          BOOLEAN DEFAULT false
  
  -- Canal de aquisição
  acquisitionChannel ENUM NULL              -- STORE, ECOMMERCE, WHATSAPP, INSTAGRAM, REFERRAL
  referredById       UUID (FK → Customer) NULL
  
  isActive          BOOLEAN DEFAULT true
  createdAt         TIMESTAMP
  updatedAt         TIMESTAMP
  deletedAt         TIMESTAMP NULL
}
```

---

## 6.2 Cálculo de Ciclo de Recompra e LTV

### Lifetime Value (LTV)

$$LTV = \bar{T} \times F \times M_{gc}$$

Onde:
- $\bar{T}$ = Ticket médio
- $F$ = Frequência de compra (compras/ano)
- $M_{gc}$ = Margem de contribuição média (%)

Para projeção de longo prazo:

$$LTV_{proj} = \bar{T} \times F \times M_{gc} \times V_{anos}$$

Onde $V_{anos}$ = Vida útil estimada do cliente (em anos)

### Cálculo do Ciclo de Recompra

```
ALGORITMO DE CICLO DE RECOMPRA:

Para cada Customer com ≥ 3 compras:
  1. Obter datas de todas as compras (ordenadas)
  2. Calcular intervalos entre compras consecutivas:
     intervalos = [data[i+1] - data[i] para i em 0..n-1]
  3. avgRepurchaseDays = média(intervalos)
  4. desvio = desvio_padrão(intervalos)
  5. nextPurchaseEst = últimaCompra + avgRepurchaseDays

DETECÇÃO DE CHURN:

  diasSemCompra = HOJE - lastPurchaseAt
  
  Se diasSemCompra < avgRepurchaseDays × 1.2:     → LOW risk
  Se diasSemCompra < avgRepurchaseDays × 1.5:     → MEDIUM risk
  Se diasSemCompra < avgRepurchaseDays × 2.0:     → HIGH risk
  Se diasSemCompra ≥ avgRepurchaseDays × 2.0:     → CHURNED
```

### Exemplo Prático

```
Cliente: Ana Souza
Compras: 15/01, 22/04, 10/08, 28/12 (2026)
Intervalos: 97, 110, 140 dias
Média: 115.7 dias (~4 meses)
Desvio: 21.7 dias

Próxima compra estimada: 28/12 + 116 = 23/04/2027
Janela ideal de abordagem: 28/03 a 15/04 (30-10 dias antes)

GATILHO: Enviar oferta personalizada em 28/03/2027
```

---

## 6.3 Gatilhos Automatizados

### Motor de Regras

```
TRIGGER ENGINE:

Cada trigger tem:
  - Condição (WHEN)
  - Ação (THEN)
  - Canal (HOW)
  - Frequência máxima (THROTTLE)
```

### Gatilhos Configurados

| # | Nome | Condição (WHEN) | Ação (THEN) | Canal |
|---|------|-----------------|-------------|-------|
| 1 | **Recompra Proativa** | diasParaProximaCompra ≤ 30 | Enviar oferta personalizada com base nas preferências | WhatsApp + Email |
| 2 | **Aniversário** | 7 dias antes do birthDate | Cupom de 15% + mensagem personalizada | WhatsApp + Email |
| 3 | **Abandono de Carrinho** | Carrinho com itens há > 1 hora (e-commerce) | Lembrete com fotos dos itens | Email (1h) → WhatsApp (24h) |
| 4 | **Pós-Compra** | 3 dias após entrega | Pedir avaliação + sugerir itens complementares | WhatsApp |
| 5 | **Risco de Churn** | churnRisk = HIGH | Oferta exclusiva de reativação (20% off) | WhatsApp + Email + SMS |
| 6 | **Win-Back** | churnRisk = CHURNED há > 30 dias | Desconto agressivo (30%) + frete grátis | Email + WhatsApp |
| 7 | **Upgrade de Tier** | Limiar de LTV atingido | Parabéns + benefícios do novo tier | WhatsApp + Email |
| 8 | **Nova Coleção** | Lançamento de coleção alinhada às preferências | Preview exclusivo + early access | WhatsApp |
| 9 | **Reposição de Básico** | Cliente compra tops de alta sustentação a cada ~6 meses | Oferta personalizada no 5º mês | WhatsApp |
| 10 | **Indicação** | Compra > R$ 300 confirmada | Solicitar indicação com benefício mútuo | WhatsApp (D+7) |

### Entidade: AutomationTrigger

```
AutomationTrigger {
  id              UUID (PK)
  name            VARCHAR(120)
  description     TEXT
  isActive        BOOLEAN DEFAULT true
  
  -- Condição
  conditionType   ENUM         -- REPURCHASE_WINDOW, BIRTHDAY, CART_ABANDONED, 
                               -- POST_DELIVERY, CHURN_RISK, LTV_MILESTONE, 
                               -- COLLECTION_LAUNCH, CUSTOM
  conditionConfig JSONB        -- Parâmetros específicos da condição
  
  -- Ação
  actionType      ENUM         -- SEND_OFFER, SEND_COUPON, SEND_MESSAGE, 
                               -- ASSIGN_POINTS, UPGRADE_TIER, CREATE_TASK
  actionConfig    JSONB        -- Template, desconto, pontos, etc.
  
  -- Controle
  channels        ENUM[]       -- [WHATSAPP, EMAIL, SMS, PUSH]
  throttleDays    INTEGER      -- Min dias entre disparos para o mesmo cliente
  maxFiresPerCustomer INTEGER  -- Máximo de vezes que dispara por cliente (NULL = ilimitado)
  
  -- Métricas
  totalFired      INTEGER DEFAULT 0
  totalConverted  INTEGER DEFAULT 0
  conversionRate  DECIMAL(5,2) GENERATED
  
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
  deletedAt       TIMESTAMP NULL
}
```

### Registro de Disparos

```
AutomationExecution {
  id              UUID (PK)
  triggerId       UUID (FK → AutomationTrigger)
  customerId      UUID (FK → Customer)
  
  channel         ENUM                     -- Canal utilizado neste disparo
  status          ENUM                     -- SENT, DELIVERED, OPENED, CLICKED, CONVERTED, FAILED
  
  -- Conteúdo
  messageContent  TEXT                     -- Mensagem enviada (para auditoria)
  couponCode      VARCHAR(20) NULL
  
  -- Resultado
  convertedAt     TIMESTAMP NULL           -- Se gerou compra
  conversionOrderId UUID NULL              -- Pedido resultante
  
  sentAt          TIMESTAMP
  deliveredAt     TIMESTAMP NULL
  openedAt        TIMESTAMP NULL
  clickedAt       TIMESTAMP NULL
}
```

---

## 6.4 Programa de Fidelidade

### Tiers de Cliente

| Tier | Requisito (12 meses) | Benefícios |
|------|----------------------|-----------|
| **Bronze** | Qualquer compra | Acúmulo 1 pt / R$ 1 |
| **Silver** | LTV ≥ R$ 1.500 ou 5+ compras | Acúmulo 1.5 pt / R$ 1, frete grátis 1x/mês |
| **Gold** | LTV ≥ R$ 4.000 ou 10+ compras | Acúmulo 2 pt / R$ 1, frete grátis, early access |
| **VIP** | LTV ≥ R$ 10.000 ou 20+ compras | Acúmulo 3 pt / R$ 1, tudo de Gold + personal stylist |

### Resgate de Pontos
- Conversão: 20 pontos = R$ 1,00 de desconto
- Mínimo para resgate: 200 pontos (R$ 10,00)
- Pontos expiram em 12 meses sem movimentação
- Resgate diretamente no checkout (PDV e e-commerce)

---

## 6.5 Segmentação RFM

### Modelo RFM (Recência, Frequência, Monetário)

```
CÁLCULO RFM (atualizado semanalmente):

Para cada Customer:
  R (Recência):   Dias desde a última compra     → Score 1-5 (5 = mais recente)
  F (Frequência): Número de compras nos últimos 12 meses → Score 1-5 (5 = mais frequente)
  M (Monetário):  Total gasto nos últimos 12 meses → Score 1-5 (5 = maior gasto)

Segmentos derivados:
  RFM 555: Champions (melhores clientes)
  RFM 5X1: Novos promissores (recentes, gastam pouco)
  RFM 1X5: Em risco (gastaram muito, sumiram)
  RFM 111: Perdidos (churn confirmado)
```

### Eventos — Módulo CRM

| Evento | Trigger | Dados |
|--------|---------|-------|
| `customer.created` | Novo cadastro | customerId, channel |
| `customer.updated` | Atualização de perfil | customerId, changedFields |
| `customer.tier_upgraded` | Mudança de tier | customerId, oldTier, newTier |
| `customer.churn_risk_changed` | Risco de churn alterado | customerId, oldRisk, newRisk |
| `customer.milestone` | Marco atingido (LTV, pedidos) | customerId, milestone |
| `automation.fired` | Gatilho disparado | triggerId, customerId, channel |
| `automation.converted` | Gatilho gerou conversão | triggerId, customerId, orderId |
| `loyalty.points_earned` | Pontos creditados | customerId, points, orderId |
| `loyalty.points_redeemed` | Pontos resgatados | customerId, points, orderId |
