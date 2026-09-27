# Módulo 07 — Dashboard e KPIs de Performance (`KPI`)

> **VISÃO-ALVO — não descreve a implementação atual.** Ver `00-VISAO-GERAL.md`.

## 7.1 Tela Inicial da Gerência

### Layout do Dashboard Executivo

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Alldav ERP  │ Dashboard Gerencial │ 📅 Abril/2027 │ 🏪 Todas as Lojas     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────┐ │
│  │ MARKUP MÉDIO   │  │ GIRO ESTOQUE   │  │ TX CONVERSÃO   │  │   GMROI    │ │
│  │                │  │                │  │   (Física)     │  │            │ │
│  │    ▲ 3.1       │  │    ▲ 5.2x      │  │    ▲ 22.4%     │  │   ▲ 187%  │ │
│  │  meta: 2.5-3.8 │  │  meta: 4-7x    │  │  meta: 18-25%  │  │ meta:>150%│ │
│  │   🟢 OK        │  │   🟢 OK        │  │   🟢 OK        │  │  🟢 OK    │ │
│  └────────────────┘  └────────────────┘  └────────────────┘  └────────────┘ │
│                                                                              │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────────┐│
│  │ VENDAS — HOJE                   │  │ MARGEM DE CONTRIBUIÇÃO (mês)       ││
│  │                                 │  │                                    ││
│  │ Faturamento:    R$ 12.340,00    │  │ MC Total:    R$ 66.690,00         ││
│  │ Meta do dia:    R$ 15.000,00    │  │ MC %:        37.1%                ││
│  │ Progresso:      ████████░░ 82%  │  │ Meta:        35.0%                ││
│  │                                 │  │                                    ││
│  │ Ticket Médio:   R$ 287,50       │  │ ▓▓▓▓▓▓▓▓▓▓▓░░ 94% da meta       ││
│  │ Peças/Venda:    2.3             │  │                                    ││
│  │ #Vendas:        43              │  │ Alerta: TOP-PWR-X MC = 28% ⚠️     ││
│  └──────────────────────────────────┘  └────────────────────────────────────┘│
│                                                                              │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────────┐│
│  │ ALERTAS DE ESTOQUE              │  │ VENDAS POR CANAL (mês)             ││
│  │                                 │  │                                    ││
│  │ 🔴 3 modelos com ruptura de     │  │ Loja Física:  ████████████ 70%     ││
│  │    grade (M/G esgotados)        │  │ E-commerce:   █████░░░░░░ 20%     ││
│  │ 🟡 7 SKUs abaixo do ponto      │  │ WhatsApp:     ██░░░░░░░░░ 10%     ││
│  │    de pedido                    │  │                                    ││
│  │ 🟢 92% dos SKUs Classe A       │  │ Crescimento e-com: +15% vs mês ant││
│  │    com estoque saudável         │  │                                    ││
│  └──────────────────────────────────┘  └────────────────────────────────────┘│
│                                                                              │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────────┐│
│  │ RANKING VENDEDORES (mês)        │  │ DEVOLUÇÕES / TROCAS               ││
│  │                                 │  │                                    ││
│  │ 1. 🥇 Maria S.  R$ 45.200 (32%)│  │ Taxa e-commerce: 14.2%            ││
│  │ 2. 🥈 João P.   R$ 38.100 (27%)│  │ Taxa loja:       3.1%             ││
│  │ 3. 🥉 Ana L.    R$ 29.800 (21%)│  │ Motivo #1: Tamanho (58%)          ││
│  │ 4.    Carlos M. R$ 16.400 (12%)│  │ Pendentes inspeção: 5             ││
│  │ 5.    Paula R.  R$ 10.500 (8%) │  │ SLA médio resolução: 3.2 dias     ││
│  └──────────────────────────────────┘  └────────────────────────────────────┘│
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ PRODUÇÃO — STATUS DAS OPs                                               ││
│  │                                                                         ││
│  │ 🟢 No prazo: 12 OPs │ 🟡 Atenção: 3 OPs │ 🔴 Atrasadas: 1 OP         ││
│  │ Peças em produção: 3.200 │ Previsão entrega semana: 800 peças          ││
│  └──────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 7.2 KPIs Primários — Benchmarks de Mercado

### 1. Markup Médio

$$Markup = \frac{PV}{CMV}$$

| Faixa | Classificação | Ação |
|-------|--------------|------|
| < 2.5 | 🔴 Abaixo do mercado | Revisar custos ou aumentar preços |
| 2.5 - 3.0 | 🟡 Aceitável (básicos) | Monitorar |
| 3.0 - 3.5 | 🟢 Saudável | Manter |
| 3.5 - 3.8 | 🟢 Excelente | Meta para premium |
| > 3.8 | 🟡 Acima do mercado | Verificar competitividade |

### 2. Giro de Estoque

$$Giro = \frac{CMV_{anual}}{Estoque\_M\text{é}dio}$$

| Faixa | Classificação | Ação |
|-------|--------------|------|
| < 4x/ano | 🔴 Estoque parado | Liquidar itens Classe C, reduzir compras |
| 4 - 5x/ano | 🟡 Aceitável | Otimizar mix |
| 5 - 7x/ano | 🟢 Saudável | Manter estratégia |
| > 7x/ano | 🟡 Atenção | Risco de ruptura — aumentar estoque |

### 3. Taxa de Conversão (Loja Física)

$$Conv\% = \frac{N\text{º} de Vendas}{N\text{º} de Visitantes} \times 100$$

| Faixa | Classificação | Ação |
|-------|--------------|------|
| < 18% | 🔴 Baixa | Treinar equipe, revisar abordagem, visual merchandising |
| 18 - 22% | 🟡 Aceitável | Otimizar |
| 22 - 25% | 🟢 Excelente | Manter e compartilhar boas práticas |
| > 25% | 🟢 Outstanding | Benchmark interno |

**Nota**: Requer contador de pessoas na porta (sensor ou câmera com IA).

### 4. GMROI — Gross Margin Return on Investment

$$GMROI = \frac{Margem\_Bruta}{Estoque\_M\text{é}dio\_a\_Custo} \times 100$$

| Faixa | Classificação | Ação |
|-------|--------------|------|
| < 150% | 🔴 Investimento ineficiente | Revisar mix, reduzir estoque de baixo giro |
| 150 - 200% | 🟡 Bom | Otimizar |
| 200 - 300% | 🟢 Excelente | Manter |
| > 300% | 🟢 Outstanding | Expandir categorias rentáveis |

---

## 7.3 KPIs Secundários

| KPI | Fórmula | Meta | Periodicidade |
|-----|---------|------|--------------|
| **Ticket Médio** | Faturamento / Nº Vendas | R$ 250 - R$ 350 | Diário |
| **UPT (Unidades por Transação)** | Peças vendidas / Nº Vendas | 2.0 - 3.0 | Diário |
| **Sell-Through Rate** | Vendas / (Estoque Inicial + Compras) | > 65% por coleção | Por coleção |
| **Dias de Estoque** | Estoque Atual / Venda Média Diária | 45 - 90 dias | Semanal |
| **Taxa de Devolução (e-com)** | Devoluções / Vendas e-com | < 15% | Mensal |
| **LTV Médio** | Soma LTV / Clientes Ativos | > R$ 2.000 | Mensal |
| **Custo de Aquisição (CAC)** | Investimento Mkt / Novos Clientes | < R$ 80 | Mensal |
| **CAC Payback** | CAC / Ticket Médio | < 1 compra | Mensal |
| **Taxa de Recompra** | Clientes com 2+ compras / Total | > 35% | Mensal |
| **NPS** | Promotores - Detratores | > 50 | Trimestral |
| **Ruptura de Grade** | Modelos com ruptura / Total modelos | < 10% | Diário |
| **Acurácia de Estoque** | (1 - |divergências| / itens contados) | > 98% | Por inventário |

---

## 7.4 Configuração de Alertas

### Regras de Notificação

```
ALERTAS AUTOMÁTICOS:

// Vendas
Se vendas_hoje < meta_diária × 0.5 até 15h → Alerta gerente
Se ticket_médio_semana < meta × 0.8         → Alerta gerente + vendedores

// Estoque  
Se ruptura_de_grade > 10%                   → Alerta gerente + compras
Se SKU Classe A abaixo do ponto de pedido   → Alerta compras (automático)
Se acurácia_estoque < 95%                   → Alerta operações

// Financeiro
Se MC% do mês < 30%                         → Alerta diretoria
Se markup de qualquer produto < 2.2         → Bloquear venda + alerta

// CRM
Se taxa_recompra_mês < 25%                  → Alerta marketing
Se NPS < 30                                 → Alerta diretoria

// Produção
Se OP com 🔴 (prazo crítico)               → Alerta diretoria + compras
```

---

## 7.5 Drill-Down — Navegação Analítica

```
HIERARQUIA DE DRILL-DOWN:

Dashboard Geral
  └── Por Loja
       └── Por Categoria (Leggings, Tops, Shorts...)
            └── Por Modelo
                 └── Por SKU (cor × tamanho)
                      └── Por Período (dia, semana, mês)

Dashboard Financeiro
  └── Por Centro de Custo
       └── Por Tipo de Despesa
            └── Por Lançamento Individual

Dashboard CRM
  └── Por Segmento RFM
       └── Por Tier
            └── Por Cliente Individual
                 └── Histórico completo de interações
```

---

## 7.6 Exportação e Integração

| Formato | Uso | Destinatário |
|---------|-----|-------------|
| PDF | Relatórios formais | Diretoria, investidores |
| Excel/CSV | Análise ad-hoc | Gerentes, financeiro |
| API REST | Integração BI (Power BI, Metabase) | Equipe de dados |
| Email agendado | Relatórios periódicos | Configurável por usuário |
| Push notification | Alertas em tempo real | App mobile do gerente |
