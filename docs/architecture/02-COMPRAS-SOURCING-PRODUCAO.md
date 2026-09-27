# Módulo 02 — Compras, Sourcing e Produção (`PRC`)

> **VISÃO-ALVO — não descreve a implementação atual.** Ver `00-VISAO-GERAL.md`.

## 2.1 Cadastro de Matéria-Prima

### Entidade: RawMaterial

```
RawMaterial {
  id                UUID (PK)
  code              VARCHAR(20) UNIQUE       -- "TEC-PA66-280-EMN"
  name              VARCHAR(120)             -- "Poliamida 6.6 Emana 280g"
  category          ENUM                     -- TECIDO, AVIAMENTO, EMBALAGEM, ETIQUETA
  
  -- Especificações Técnicas de Tecido
  fabricType        ENUM                     -- POLIAMIDA_6, POLIAMIDA_66, POLIESTER, ALGODAO, BLEND
  yarnTechnology    ENUM                     -- STANDARD, EMANA, SUPPLEX, AMNI, LYCRA_SPORT
  grammage          DECIMAL(6,2)             -- g/m² (ex: 280.00)
  width             DECIMAL(5,2)             -- Largura em metros (ex: 1.50)
  composition       VARCHAR(255)             -- "85% Poliamida 6.6 Emana, 15% Elastano"
  elasticity        DECIMAL(5,2)             -- % de elasticidade
  uvProtection      BOOLEAN DEFAULT false
  moistureWicking   BOOLEAN DEFAULT false    -- Dry Fit
  compression       ENUM                     -- NONE, LIGHT, MEDIUM, HIGH
  
  -- Certificações
  oekoTexCertified  BOOLEAN DEFAULT false
  recycledContent   DECIMAL(5,2)             -- % de material reciclado
  
  -- Fornecimento
  primarySupplierId UUID (FK → Supplier)
  backupSupplierId  UUID (FK → Supplier) NULL
  unitOfMeasure     ENUM                     -- METRO, KG, UNIDADE, ROLO
  unitCost          DECIMAL(10,4)
  moq               INTEGER                  -- Quantidade mínima de pedido
  leadTimeDays      INTEGER                  -- Prazo de entrega em dias
  
  -- Controle
  isActive          BOOLEAN DEFAULT true
  createdAt         TIMESTAMP
  updatedAt         TIMESTAMP
  deletedAt         TIMESTAMP NULL
}
```

### Classificação de Tecidos — Referência Rápida

| Tipo | Gramatura | Indicação | Custo Relativo |
|------|-----------|-----------|----------------|
| Poliamida 6 Standard | 200-240 g/m² | Básicos, custo reduzido | $ |
| Poliamida 6.6 | 240-300 g/m² | Performance, durabilidade | $$ |
| Poliamida 6.6 + Emana | 260-310 g/m² | Premium, infravermelho longo | $$$ |
| Supplex® | 220-280 g/m² | Toque algodão, performance | $$ |
| AMNI® | 180-240 g/m² | Antibacteriano, secagem rápida | $$ |

### Ficha Técnica do Produto (BOM — Bill of Materials)

```
ProductBOM {
  id              UUID (PK)
  productId       UUID (FK → Product)
  rawMaterialId   UUID (FK → RawMaterial)
  consumptionQty  DECIMAL(10,4)            -- Consumo por peça (ex: 0.85 metros)
  consumptionUnit ENUM                     -- METRO, KG, UNIDADE
  wastePercent    DECIMAL(5,2)             -- % de desperdício estimado
  notes           TEXT NULL
  
  UNIQUE(productId, rawMaterialId)
}
```

---

## 2.2 Cadastro de Fornecedores

### Entidade: Supplier

```
Supplier {
  id              UUID (PK)
  type            ENUM                     -- FABRIC_SUPPLIER, TRIM_SUPPLIER, CMT_FACTORY, FULL_PACKAGE
  companyName     VARCHAR(200)
  tradeName       VARCHAR(200)
  cnpj            VARCHAR(14) UNIQUE
  stateReg        VARCHAR(20)
  
  -- Contato
  contactName     VARCHAR(120)
  phone           VARCHAR(20)
  email           VARCHAR(255)
  address         JSONB                    -- {street, city, state, zip, country}
  
  -- Avaliação
  qualityScore    DECIMAL(3,2)             -- 0.00 a 5.00 (média calculada)
  deliveryScore   DECIMAL(3,2)             -- 0.00 a 5.00 (pontualidade)
  overallRating   DECIMAL(3,2) GENERATED   -- Média ponderada
  
  -- Comercial
  paymentTerms    VARCHAR(100)             -- "30/60/90 DDL"
  minOrderValue   DECIMAL(10,2)
  
  isActive        BOOLEAN DEFAULT true
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
  deletedAt       TIMESTAMP NULL
}
```

---

## 2.3 Fluxo de Compras

### Ciclo de Compra — Matéria-Prima

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  IDENTIFICAÇÃO   │───▶│   COTAÇÃO        │───▶│  APROVAÇÃO       │
│  DA NECESSIDADE  │    │   (min 3 forn.)  │    │  (alçada)        │
└──────────────────┘    └──────────────────┘    └────────┬─────────┘
                                                         │
┌──────────────────┐    ┌──────────────────┐    ┌────────▼─────────┐
│  RECEBIMENTO     │◀───│   FOLLOW-UP      │◀───│  PEDIDO DE       │
│  + INSPEÇÃO      │    │   (tracking)     │    │  COMPRA (PO)     │
└────────┬─────────┘    └──────────────────┘    └──────────────────┘
         │
┌────────▼─────────┐
│  ENTRADA NO      │
│  ESTOQUE (INV)   │
└──────────────────┘
```

### Alçadas de Aprovação

| Valor do Pedido | Aprovador |
|-----------------|-----------|
| Até R$ 5.000 | Comprador sênior |
| R$ 5.001 - R$ 25.000 | Gerente de compras |
| R$ 25.001 - R$ 100.000 | Diretor comercial |
| Acima de R$ 100.000 | Diretoria (2 assinaturas) |

---

## 2.4 Gestão de Facção (Produção Terceirizada)

### Conceito
No modelo de **facção**, a marca envia a matéria-prima (tecido, aviamentos, etiquetas) para uma confecção terceirizada (faccionista) que realiza o corte, costura e acabamento. A marca mantém o controle do design, qualidade e prazos.

### Entidade: ProductionOrder (Ordem de Produção / Remessa de Industrialização)

```
ProductionOrder {
  id                  UUID (PK)
  code                VARCHAR(20) UNIQUE       -- "OP-2027-001"
  supplierId          UUID (FK → Supplier)     -- Faccionista
  collectionId        UUID (FK → Collection)
  status              ENUM                     -- Vide máquina de estados abaixo
  
  -- Prazos
  issuedAt            TIMESTAMP                -- Data de emissão
  materialSentAt      TIMESTAMP NULL           -- Data envio da MP
  estimatedStartAt    TIMESTAMP                -- Previsão início produção
  actualStartAt       TIMESTAMP NULL
  estimatedCompleteAt TIMESTAMP                -- Previsão entrega
  actualCompleteAt    TIMESTAMP NULL
  deadlineAt          TIMESTAMP                -- Data limite (coleção drop)
  
  -- Quantidades
  totalPieces         INTEGER
  completedPieces     INTEGER DEFAULT 0
  approvedPieces      INTEGER DEFAULT 0
  rejectedPieces      INTEGER DEFAULT 0
  
  -- Financeiro
  unitCostCMT         DECIMAL(10,4)            -- Custo de mão de obra por peça
  totalCost           DECIMAL(12,2) GENERATED
  
  -- Notas
  technicalNotes      TEXT                     -- Instruções de costura, acabamento
  qualityNotes        TEXT NULL                -- Observações de qualidade
  
  createdAt           TIMESTAMP
  updatedAt           TIMESTAMP
  deletedAt           TIMESTAMP NULL
}
```

### Itens da Ordem de Produção

```
ProductionOrderItem {
  id                  UUID (PK)
  productionOrderId   UUID (FK → ProductionOrder)
  productId           UUID (FK → Product)
  variantId           UUID (FK → ProductVariant)
  quantity            INTEGER
  completedQty        INTEGER DEFAULT 0
  approvedQty         INTEGER DEFAULT 0
  rejectedQty         INTEGER DEFAULT 0
  
  UNIQUE(productionOrderId, variantId)
}
```

### Máquina de Estados — Ordem de Produção

```
  ┌────────┐     ┌──────────┐     ┌─────────────┐     ┌────────────┐
  │ DRAFT  │────▶│ APPROVED │────▶│ MATERIAL    │────▶│ IN         │
  │        │     │          │     │ SENT        │     │ PRODUCTION │
  └────────┘     └──────────┘     └─────────────┘     └─────┬──────┘
                                                            │
  ┌────────────────┐     ┌────────────┐     ┌───────────────▼─────┐
  │ COMPLETED      │◀────│ QUALITY    │◀────│ PARTIAL             │
  │ (estoque ++)   │     │ INSPECTION │     │ DELIVERY            │
  └────────────────┘     └─────┬──────┘     └─────────────────────┘
                               │
                        ┌──────▼──────┐
                        │ REWORK      │ (peças rejeitadas voltam
                        │ (retrabalho)│  para produção)
                        └─────────────┘

  A qualquer momento: → CANCELLED (com justificativa obrigatória)
```

### Controle de Prazos — Alertas de Timing

Um atraso na facção pode significar perder o **timing de coleção** e a janela de venda, resultando em peças que só podem ser vendidas com desconto.

```
REGRAS DE ALERTA DE PRAZO:

diasRestantes = deadlineAt - HOJE

🟢 NO PRAZO:      diasRestantes > 15 E status adequado ao cronograma
🟡 ATENÇÃO:       diasRestantes ≤ 15 E status = IN_PRODUCTION
🟠 RISCO:         diasRestantes ≤ 7  E status != QUALITY_INSPECTION
🔴 CRÍTICO:       diasRestantes ≤ 0  E status != COMPLETED
                   OU actualCompleteAt > deadlineAt

Ações automáticas:
- 🟡 → Notificação ao comprador responsável
- 🟠 → Notificação ao gerente + escalonamento
- 🔴 → Alerta à diretoria + registro de penalidade do fornecedor
       → Reduz deliveryScore do Supplier automaticamente
```

### Dashboard de Produção — Visão por Coleção

| OP | Faccionista | Modelo | Peças | Progresso | Prazo | Status |
|----|-------------|--------|-------|-----------|-------|--------|
| OP-2027-001 | Confecção Alta Costura | Legging Sculpt V2 | 500 | 80% | 12/05 | 🟢 |
| OP-2027-002 | Ateliê Fitness Pro | Top Power X | 300 | 45% | 10/05 | 🟡 |
| OP-2027-003 | MG Confecções | Short Run Pro | 200 | 20% | 08/05 | 🔴 |

### Controle de Qualidade — Inspeção no Recebimento da Facção

```
CHECKLIST DE INSPEÇÃO (obrigatório para aceitar lote):

□ Medidas conferem com a ficha técnica (tolerância ±1cm)
□ Costuras sem falhas (ponto firme, sem fios soltos)
□ Tecido sem defeitos (furos, manchas, variação de cor)
□ Etiquetas corretas (composição, tamanho, marca, CNPJ)
□ Acabamento conforme padrão (overloque, barras, elásticos)
□ Embalagem individual adequada
□ Amostra aleatória: mínimo 10% do lote para inspeção detalhada

RESULTADO:
- APROVADO: ≥ 95% conforme → entrada no estoque
- APROVADO COM RESSALVA: 90-95% → entrada + notificação
- REJEITADO: < 90% → devolução para retrabalho
```

### Remessa de Industrialização — Integração Fiscal

```
FLUXO FISCAL DA FACÇÃO:

1. ENVIO de MP para faccionista:
   - Emitir NF-e de remessa de industrialização (CFOP 5.901/6.901)
   - Suspensão de ICMS (remessa para industrialização)
   - Baixar MP do estoque próprio
   
2. RETORNO do produto acabado:
   - Receber NF-e do faccionista (CFOP 5.902/6.902 - retorno)
   - NF-e complementar com valor da mão de obra (CFOP 5.124/6.124)
   - Dar entrada do produto acabado no estoque
   
3. CONTROLE DE INSUMOS:
   - Sistema rastreia saldo de MP enviada vs. retornada
   - Calcula desperdício real vs. estimado (BOM)
   - Cobra faccionista se desperdício > tolerância acordada
```

### Eventos — Módulo PRC

| Evento | Trigger | Dados |
|--------|---------|-------|
| `purchase.requested` | Nova solicitação de compra | items[], requesterId |
| `purchase.quoted` | Cotação recebida | supplierId, items[], prices[] |
| `purchase.approved` | Aprovação na alçada | purchaseOrderId, approverId |
| `purchase.order_placed` | PO enviada ao fornecedor | purchaseOrderId, supplierId |
| `purchase.received` | Recebimento conferido | purchaseOrderId, items[], divergences[] |
| `production.order_created` | OP criada | productionOrderId, supplierId |
| `production.material_sent` | MP enviada ao faccionista | productionOrderId, materials[] |
| `production.progress_updated` | Atualização de progresso | productionOrderId, completedPieces |
| `production.quality_inspected` | Inspeção realizada | productionOrderId, approved, rejected |
| `production.completed` | OP finalizada | productionOrderId, totalApproved |
| `production.deadline_risk` | Prazo em risco | productionOrderId, diasRestantes, severity |
