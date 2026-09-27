# Módulo 01 — Estoque e SKUs (`INV`)

> **VISÃO-ALVO — não descreve a implementação atual.** Ver `00-VISAO-GERAL.md`.

## 1.1 Modelagem da Grade de Produtos

### Hierarquia de Cadastro

```
Coleção (ex: Verão 2027)
 └── Linha (ex: Performance, Lifestyle, Premium)
      └── Categoria (ex: Tops, Leggings, Shorts, Conjuntos)
           └── Modelo/Produto (ex: Legging Sculpt V2)
                └── Variante/SKU (ex: Legging Sculpt V2 - Preta - M)
```

### Entidades Principais

#### Product (Modelo)
```
Product {
  id              UUID (PK)
  code            VARCHAR(20) UNIQUE         -- Código interno (ex: "LGS-SCULPT-V2")
  name            VARCHAR(120)               -- Nome do modelo
  collectionId    UUID (FK → Collection)
  lineId          UUID (FK → Line)
  categoryId      UUID (FK → Category)
  description     TEXT
  composition     VARCHAR(255)               -- "85% Poliamida, 15% Elastano"
  weight          DECIMAL(6,2)               -- Gramatura em g/m²
  fabricType      ENUM                       -- POLIAMIDA_6, POLIAMIDA_66, EMANA, SUPPLEX, AMNI
  technology      VARCHAR(255)[]             -- ["UV Protection", "Dry Fit", "Seamless"]
  costPrice       DECIMAL(10,2)
  basePrice       DECIMAL(10,2)
  markup          DECIMAL(4,2)
  abcClass        ENUM (A, B, C)            -- Classificação Curva ABC
  seasonality     ENUM (BASIC, SEASONAL, FASHION_BET)
  isActive        BOOLEAN DEFAULT true
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
  deletedAt       TIMESTAMP NULL             -- Soft delete
}
```

#### ProductVariant (SKU)
```
ProductVariant {
  id              UUID (PK)
  productId       UUID (FK → Product)
  sku             VARCHAR(30) UNIQUE         -- "LGS-SCULPT-V2-BLK-M"
  barcode         VARCHAR(14) UNIQUE         -- EAN-13
  rfidTag         VARCHAR(96) UNIQUE         -- EPC RFID
  colorId         UUID (FK → Color)
  sizeId          UUID (FK → Size)
  additionalCost  DECIMAL(10,2) DEFAULT 0    -- Custo extra por variante
  isActive        BOOLEAN DEFAULT true
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
  deletedAt       TIMESTAMP NULL
}
```

#### StockPosition (Posição de Estoque por Local)
```
StockPosition {
  id              UUID (PK)
  variantId       UUID (FK → ProductVariant)
  locationId      UUID (FK → Location)       -- Loja, CD, Trânsito
  quantity         INTEGER
  reservedQty     INTEGER DEFAULT 0           -- Reservado por pedidos pendentes
  availableQty    GENERATED (quantity - reservedQty)
  minStock        INTEGER                     -- Ponto de pedido
  safetyStock     INTEGER                     -- Estoque de segurança calculado
  maxStock        INTEGER
  lastCountAt     TIMESTAMP                   -- Último inventário
  updatedAt       TIMESTAMP
  
  UNIQUE(variantId, locationId)
}
```

### Geração Automática de SKUs

O sistema gera automaticamente todas as combinações ao cadastrar um modelo:

```
Ao criar "Legging Sculpt V2":
  Cores selecionadas: [Preta, Marinho, Rosa]
  Tamanhos selecionados: [PP, P, M, G, GG]
  
  → 3 × 5 = 15 SKUs gerados automaticamente
  → Códigos: LGS-SCULPT-V2-BLK-PP ... LGS-SCULPT-V2-PNK-GG
  → EAN-13 gerados sequencialmente
  → Tags RFID atribuídas no recebimento
```

### Padrão de SKU
```
[CAT]-[MODELO]-[V]-[COR]-[TAM]
 │      │       │    │     └── PP, P, M, G, GG
 │      │       │    └── 3 letras (BLK, NVY, PNK, WHT...)
 │      │       └── Versão (V1, V2...)
 │      └── Slug do modelo (max 10 chars)
 └── Categoria (LGS, TOP, SHR, CNJ, BDY)
```

---

## 1.2 Alertas Preditivos — Ruptura de Grade

### Conceito
A **ruptura de grade** ocorre quando tamanhos específicos (especialmente M e G) esgotam antes dos demais, tornando o modelo comercialmente inviável. Um modelo com apenas PP e GG disponíveis equivale, na prática, a uma ruptura total.

### Lógica de Detecção

```
ALERTA DE RUPTURA DE GRADE:

Para cada Product ativo:
  1. Calcular a "completude de grade" (%)
     completude = (SKUs com estoque > 0) / (SKUs ativos totais) × 100

  2. Calcular a "cobertura de pico" (%)
     coberturaPico = (SKUs de tamanhos M/G com estoque > 0) / (Total de M/G) × 100

  3. REGRAS DE ALERTA:
     - 🔴 CRÍTICO: coberturaPico < 30% OU completude < 40%
     - 🟡 ATENÇÃO: coberturaPico < 60% OU completude < 70%
     - 🟢 SAUDÁVEL: coberturaPico ≥ 60% E completude ≥ 70%
```

### Predição de Ruptura

```
PROJEÇÃO DE ESGOTAMENTO:

Para cada SKU:
  diasParaEsgotamento = estoqueAtual / mediaVendasDiarias(últimos30dias)

  Se diasParaEsgotamento < leadTimeReposição:
    → Disparar alerta "REPOSIÇÃO URGENTE"
    → Se for tamanho M ou G:
      → Elevar prioridade para CRÍTICA
      → Notificar gerente + compras automaticamente
```

### Relatório de Integridade de Grade

| Modelo | Grade Total | Disponíveis | Completude | M/G Status | Alerta |
|--------|-------------|-------------|------------|------------|--------|
| Legging Sculpt V2 | 15 SKUs | 12 | 80% | 5/6 | 🟢 |
| Top Power X | 10 SKUs | 4 | 40% | 0/4 | 🔴 |
| Short Run Pro | 15 SKUs | 10 | 67% | 3/6 | 🟡 |

---

## 1.3 Curva ABC — Classificação e Reposição

### Cálculo da Curva ABC

```
CLASSIFICAÇÃO CURVA ABC (recalculada mensalmente):

1. Para cada Product, calcular receita acumulada nos últimos 90 dias
2. Ordenar por receita decrescente
3. Calcular participação acumulada (%)

Se participaçãoAcumulada ≤ 80%   → Classe A (≈20% dos itens)
Se participaçãoAcumulada ≤ 95%   → Classe B (≈30% dos itens)
Se participaçãoAcumulada > 95%   → Classe C (≈50% dos itens)
```

### Políticas por Classe

| Aspecto | Classe A | Classe B | Classe C |
|---------|----------|----------|----------|
| **Tipo típico** | Básicos alta rotatividade | Intermediários | Sazonais / Fashion bets |
| **Frequência de revisão** | Diária | Semanal | Quinzenal |
| **Reposição** | Automática | Semi-automática | Manual (aprovação) |
| **Estoque de segurança** | Alto (Z = 1.96, 97.5%) | Médio (Z = 1.65, 95%) | Baixo (Z = 1.28, 90%) |
| **Markup** | 2.5 - 3.0 | 3.0 - 3.5 | 3.5 - 3.8+ |
| **Política de desconto** | Máx 10% | Até 20% | Até 50% (liquidação) |
| **Meta de giro** | 7+ vezes/ano | 5 vezes/ano | 3-4 vezes/ano |

### Reposição Automática (Classe A)

```
FLUXO DE REPOSIÇÃO AUTOMÁTICA:

CRON diário às 06:00:
  Para cada SKU Classe A em cada Location:
    Se availableQty ≤ minStock:
      1. Calcular quantidade ideal:
         qtyReposição = maxStock - quantity + demandaEstimada(leadTime)
      2. Verificar estoque no CD:
         Se CD tem estoque → Gerar ordem de transferência
         Se CD não tem    → Gerar sugestão de compra (PRC)
      3. Registrar evento: stock.reorder_triggered
      4. Notificar compras via push/email
```

---

## 1.4 Estoque de Segurança — Cálculo Automático

### Fórmula

$$E_s = Z \times \sigma_d \times \sqrt{L}$$

Onde:
- $E_s$ = Estoque de Segurança (unidades)
- $Z$ = Fator de serviço (nível de confiança)
- $\sigma_d$ = Desvio padrão da demanda diária
- $L$ = Lead time de reposição (em dias)

### Parâmetros por Classe

| Classe | Z (Fator) | Nível de Serviço | Janela de Cálculo σd |
|--------|-----------|-------------------|----------------------|
| A | 1.96 | 97.5% | 90 dias |
| B | 1.65 | 95.0% | 60 dias |
| C | 1.28 | 90.0% | 30 dias |

### Exemplo de Cálculo

```
Legging Sculpt V2 - Preta - M (Classe A):
  Vendas diárias (últimos 90 dias): média = 3.2 un., σd = 1.1
  Lead time do fornecedor: L = 15 dias
  Z = 1.96 (Classe A)

  Es = 1.96 × 1.1 × √15
  Es = 1.96 × 1.1 × 3.87
  Es = 8.35 → arredondar para ⌈9⌉ unidades

  Ponto de pedido = (média diária × L) + Es
  Ponto de pedido = (3.2 × 15) + 9 = 57 unidades
```

### Recalculo Automático

```
CRON semanal (domingo 02:00):
  Para cada SKU ativo:
    1. Buscar vendas do período (janela conforme classe ABC)
    2. Calcular σd (desvio padrão da demanda diária)
    3. Obter L (lead time médio real das últimas 5 compras)
    4. Obter Z (conforme classificação ABC vigente)
    5. Es = Z × σd × √L
    6. Atualizar StockPosition.safetyStock = ⌈Es⌉
    7. Atualizar StockPosition.minStock = ⌈(médiaDiária × L) + Es⌉
    8. Log de auditoria: safety_stock.recalculated
```

---

## 1.5 Recebimento — RFID e Conferência Cega

### Fluxo de Recebimento

```
         ┌─────────────────┐
         │  NF-e Recebida   │
         │  (XML automático) │
         └────────┬─────────┘
                  │
         ┌────────▼─────────┐
         │ CONFERÊNCIA CEGA  │
         │ (sem acesso à NF)│
         └────────┬─────────┘
                  │
        ┌─────────▼──────────┐
        │ Operador conta e    │
        │ registra quantidades│
        │ (scanner RFID ou    │
        │  leitor de barras)  │
        └─────────┬──────────┘
                  │
         ┌────────▼─────────┐
         │  CONFRONTO        │
         │  Sistema × NF     │
         └────────┬─────────┘
                  │
          ┌───────┴────────┐
          │                │
    ┌─────▼─────┐   ┌─────▼──────┐
    │ CONFERE ✓ │   │ DIVERGE ✗  │
    │Dar entrada │   │Gerar       │
    │no estoque  │   │ocorrência  │
    └───────────┘   │p/ supervisor│
                    └────────────┘
```

### Conferência Cega

**Princípio**: O conferente **NÃO** tem acesso às quantidades da NF durante a contagem. Só vê: código do produto, descrição, cor e tamanho. A quantidade esperada é oculta.

```
REGRAS DA CONFERÊNCIA CEGA:

1. Sistema recebe XML da NF-e automaticamente (SEFAZ)
2. Cria "Ordem de Recebimento" com status AGUARDANDO_CONFERENCIA
3. Na tela do conferente, exibe APENAS:
   - SKU / Código de barras
   - Nome do produto + cor + tamanho
   - Campo para digitar quantidade contada
   - ❌ NÃO exibe quantidade esperada da NF
4. Após conferência completa:
   - Sistema compara contagem × NF automaticamente
   - Tolerância: 0% para peças (contagem exata)
5. Se divergência:
   - Bloquear entrada no estoque
   - Gerar alerta para supervisor
   - Exigir recontagem ou justificativa documentada
6. Se confere:
   - Dar entrada automática no estoque
   - Atualizar posições de estoque em tempo real
   - Emitir evento: stock.received
```

### Integração RFID

```
FLUXO RFID NO RECEBIMENTO:

1. Cada peça recebe tag RFID na fábrica/facção (ou na etiquetagem interna)
2. Tag EPC contém: prefixo da empresa + código SKU + serial único
3. No recebimento:
   - Caixas passam pelo portal RFID (antena de passagem)
   - Leitura em lote: centenas de peças em segundos
   - Sistema registra cada tag lida
   - Confronto automático: tags lidas × itens da NF
4. Inventário em tempo real:
   - Antenas RFID nas portas das lojas
   - Inventário cíclico via leitor RFID portátil (100% do estoque em < 30min)
   - Detecção automática de furto (peça saindo sem registro de venda)
```

### Mapa de Eventos — Módulo INV

| Evento | Trigger | Dados |
|--------|---------|-------|
| `stock.received` | Aprovação de recebimento | variantId, qty, locationId, purchaseOrderId |
| `stock.updated` | Qualquer alteração de qtd | variantId, locationId, oldQty, newQty, reason |
| `stock.reserved` | Pedido criado | variantId, locationId, qty, orderId |
| `stock.released` | Pedido cancelado | variantId, locationId, qty, orderId |
| `stock.transferred` | Transferência entre locais | variantId, fromLocation, toLocation, qty |
| `stock.low_alert` | Qty ≤ minStock | variantId, locationId, currentQty, minStock |
| `stock.grade_rupture` | Completude < threshold | productId, locationId, completude, coberturaPico |
| `stock.rfid_discrepancy` | Contagem RFID diverge | locationId, expected, counted, discrepancies[] |
| `stock.reorder_triggered` | Qty ≤ reorder point | variantId, locationId, suggestedQty |
| `stock.safety_recalculated` | Recálculo semanal | variantId, oldEs, newEs, params |
