# Módulo 04 — Financeiro e Controladoria (`FIN`)

> **VISÃO-ALVO — não descreve a implementação atual.** Ver `00-VISAO-GERAL.md`.

## 4.1 Margem de Contribuição

### Fórmula Central

$$MC = PV - (CV + Imp)$$

Onde:
- $MC$ = Margem de Contribuição (R$ por peça)
- $PV$ = Preço de Venda
- $CV$ = Custos Variáveis (CMV + taxas de cartão + antecipação + comissão)
- $Imp$ = Impostos sobre a venda (ICMS, PIS, COFINS, ISS se aplicável)

### Composição Detalhada dos Custos Variáveis

```
CUSTO VARIÁVEL UNITÁRIO (por peça vendida):

  CV = CMV + TaxaCartão + TaxaAntecipação + ComissãoVendedor + CustoOcupação + CustoFrete

Onde:
  CMV = Custo de Matéria-Prima
      + Custo de Mão de Obra (facção CMT)
      + Custo de Aviamentos e Embalagem
      + Rateio de Desperdício

  TaxaCartão = PV × taxaAdm%
    Débito:  ~1.2%
    Crédito: ~2.5% a 4.5% (depende de parcelas)
    Pix:     ~0.5% a 1.0%

  TaxaAntecipação = ValorParcelado × taxaAntecipação% × prazoMédio/30
    (quando a loja antecipa os recebíveis de cartão)

  ComissãoVendedor = PV × comissão%
    Venda presencial: 3% a 8%
    Venda WhatsApp:   2% a 5%
    E-commerce:       0% (sem vendedor)

  CustoOcupação = AluguelMensal / PeçasVendidas(mês)
    Aluguel de shopping: R$ 15.000 a R$ 80.000/mês
    Pode incluir: aluguel mínimo + % sobre faturamento
    
  CustoFrete = (apenas e-commerce/WhatsApp com entrega)
    Frete grátis: absorvido integralmente pela loja
    Frete parcial: diferença entre custo real e cobrado do cliente
```

### Exemplo de DRE por Margem de Contribuição

```
DRE — MARGEM DE CONTRIBUIÇÃO (Mensal)
Loja: Shopping Ibirapuera | Período: Janeiro/2027
═══════════════════════════════════════════════════════════════

 (+) RECEITA BRUTA DE VENDAS                         R$ 180.000,00
     Loja física (PDV)           R$ 126.000,00  (70%)
     E-commerce                   R$  36.000,00  (20%)
     WhatsApp                     R$  18.000,00  (10%)

 (-) DEDUÇÕES DA RECEITA
     ICMS (18%)                  (R$  32.400,00)
     PIS (1.65%)                 (R$   2.970,00)
     COFINS (7.6%)               (R$  13.680,00)
     Devoluções/Cancelamentos    (R$   3.600,00)
                                 ─────────────────
 (=) RECEITA LÍQUIDA                                  R$ 127.350,00

 (-) CUSTOS VARIÁVEIS
     CMV (matéria-prima + facção) (R$  45.000,00)  (25%)
     Taxas de cartão/Pix         (R$   4.500,00)  (2.5%)
     Antecipação de recebíveis   (R$   1.800,00)  (1.0%)
     Comissão de vendedores      (R$   7.200,00)  (4.0%)
     Frete e-commerce absorvido  (R$   2.160,00)  (1.2%)
                                 ─────────────────
     TOTAL CUSTOS VARIÁVEIS                       (R$  60.660,00)

 (=) MARGEM DE CONTRIBUIÇÃO                          R$  66.690,00
     MC% = 37.1% sobre receita bruta

 (-) CUSTOS FIXOS
     Aluguel shopping (mín + %)  (R$  22.000,00)
     Folha de pagamento          (R$  18.000,00)
     Marketing                   (R$   5.400,00)
     Sistemas/tecnologia         (R$   2.000,00)
     Outros (energia, limpeza)   (R$   3.000,00)
                                 ─────────────────
     TOTAL CUSTOS FIXOS                           (R$  50.400,00)

 (=) RESULTADO OPERACIONAL (EBITDA)                   R$  16.290,00
     Margem EBITDA = 9.1%
═══════════════════════════════════════════════════════════════
```

---

## 4.2 Entidades Financeiras

### PaymentTransaction

```
PaymentTransaction {
  id              UUID (PK)
  orderId         UUID (FK → Order)
  method          ENUM                     -- CREDIT, DEBIT, PIX, CASH, VOUCHER, STORE_CREDIT
  gateway         ENUM                     -- PAGARME, STONE, CIELO, REDE, INTERNAL
  
  -- Valores
  grossAmount     DECIMAL(10,2)            -- Valor bruto cobrado
  adminFeeRate    DECIMAL(5,4)             -- Taxa administrativa (ex: 0.0250 = 2.5%)
  adminFeeAmount  DECIMAL(10,2) GENERATED  -- grossAmount × adminFeeRate
  netAmount       DECIMAL(10,2)            -- Valor líquido a receber
  
  -- Parcelamento
  installments    INTEGER DEFAULT 1
  
  -- Antecipação
  anticipationFeeRate   DECIMAL(5,4) NULL  -- Taxa de antecipação (se aplicável)
  anticipationFeeAmount DECIMAL(10,2) NULL
  anticipatedAt         TIMESTAMP NULL
  
  -- Datas de recebimento
  expectedReceiptDate   DATE               -- Quando o $ cai na conta
  actualReceiptDate     DATE NULL
  
  -- Status
  status          ENUM                     -- PENDING, CONFIRMED, CANCELLED, REFUNDED
  gatewayTxId     VARCHAR(100)             -- ID na operadora/gateway
  
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
}
```

### FinancialEntry (Lançamento Contábil)

```
FinancialEntry {
  id              UUID (PK)
  type            ENUM                     -- REVENUE, COGS, TAX, FEE, EXPENSE, REFUND
  category        VARCHAR(50)              -- "card_admin_fee", "cmt_cost", "rent", etc.
  description     VARCHAR(255)
  
  -- Referências
  orderId         UUID (FK → Order) NULL
  locationId      UUID (FK → Location)
  
  -- Valores
  amount          DECIMAL(12,2)            -- Positivo = crédito, Negativo = débito
  
  -- Competência
  competenceDate  DATE                     -- Mês de competência
  cashDate        DATE NULL                -- Data efetiva do fluxo de caixa
  
  -- Rateio
  costCenterId    UUID (FK → CostCenter)
  
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
  deletedAt       TIMESTAMP NULL
}
```

### CostCenter (Centro de Custo)

```
CostCenter {
  id              UUID (PK)
  code            VARCHAR(20) UNIQUE       -- "CC-LJ-IBR" (Loja Ibirapuera)
  name            VARCHAR(120)
  type            ENUM                     -- STORE, ECOMMERCE, WAREHOUSE, CORPORATE
  locationId      UUID (FK → Location) NULL
  isActive        BOOLEAN DEFAULT true
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
  deletedAt       TIMESTAMP NULL
}
```

---

## 4.3 Cálculo Automático de Markup e Preço

### Motor de Precificação

```
CÁLCULO DE PREÇO DE VENDA:

Dado:
  custoProduto  = CMV unitário (da BOM + facção)
  markupDesejado = conforme classe ABC e estratégia

  preçoBase = custoProduto × markupDesejado

  // Validação:
  MC_estimada = preçoBase - (custoProduto + impostos_estimados + taxas_estimadas)
  MC_percentual = MC_estimada / preçoBase × 100

  SE MC_percentual < 30%:
    ⚠️ Alerta: "Margem abaixo do piso. Revisar custo ou markup."
  
  SE MC_percentual < 20%:
    🔴 Bloqueio: "Produto inviável financeiramente. Aprovação da diretoria necessária."
```

### Tabela de Markup por Segmento

| Segmento | Markup | MC% Esperada |
|----------|--------|-------------|
| Básicos (Classe A) | 2.5 - 3.0 | 35% - 40% |
| Performance (Classe B) | 3.0 - 3.5 | 40% - 45% |
| Premium / Emana (Classe B+) | 3.5 - 3.8 | 45% - 50% |
| Fashion Bets (Classe C) | 3.5 - 4.0 | 40% - 50% |
| Acessórios | 4.0 - 5.0 | 50%+ |

---

## 4.4 Fluxo de Caixa — Contas a Receber

### Projeção de Recebimentos

```
FLUXO DE RECEBIMENTO POR MÉTODO:

Pix / Débito:     D+1 (dia seguinte)
Crédito à vista:  D+30 (ou D+1 se antecipado)
Crédito 2x:       D+30 e D+60 (ou D+1 se antecipado)
Crédito 3x:       D+30, D+60, D+90
Boleto:           D+2 após compensação
Dinheiro:         D+0 (imediato)

ANTECIPAÇÃO:
  Custo = ValorParcela × taxaAntecipação × diasAntecipados / 30
  Exemplo: R$ 1.000 em 3x, antecipação para D+1:
    Parcela 1 (D+30): R$ 333,33 × 1.8% × 29/30 = R$ 5,80
    Parcela 2 (D+60): R$ 333,33 × 1.8% × 59/30 = R$ 11,80
    Parcela 3 (D+90): R$ 333,33 × 1.8% × 89/30 = R$ 17,80
    Total antecipação: R$ 35,40 (3.54% do total)
```

---

## 4.5 Relatórios Financeiros

### Relatórios Disponíveis

| Relatório | Periodicidade | Destinatário |
|-----------|--------------|--------------|
| DRE por Margem de Contribuição | Mensal | Diretoria |
| DRE por Loja/Canal | Mensal | Gerentes |
| MC por Produto/Categoria | Semanal | Compras + Comercial |
| MC por Coleção | Por coleção | Estilo + Diretoria |
| Fluxo de Caixa Projetado | Diário (rolling 90 dias) | Financeiro |
| Contas a Receber | Diário | Financeiro |
| Contas a Pagar | Diário | Financeiro |
| Análise de Taxas de Cartão | Mensal | Financeiro |
| Custo de Ocupação vs. Faturamento | Mensal | Diretoria |

### Eventos — Módulo FIN

| Evento | Trigger | Dados |
|--------|---------|-------|
| `payment.confirmed` | Gateway confirma | orderId, method, amount, txId |
| `payment.refunded` | Estorno processado | orderId, amount, reason |
| `payment.anticipated` | Antecipação realizada | txIds[], totalAnticipated, fee |
| `financial.entry_created` | Lançamento contábil | entryId, type, amount, competence |
| `financial.mc_alert` | MC abaixo do piso | productId, mc_percent, threshold |
| `invoice.issued` | NF-e/NFC-e emitida | orderId, invoiceNumber, xml |
