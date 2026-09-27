# Módulo 05 — Logística e Logística Reversa (`LOG`)

> **VISÃO-ALVO — não descreve a implementação atual.** Ver `00-VISAO-GERAL.md`.

## 5.1 Fluxo de Picking e Packing

### Visão Geral do Fulfillment

```
  order.paid
     │
     ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ PICKING  │───▶│ CHECKING │───▶│ PACKING  │───▶│ LABELING │───▶│ DISPATCH │
│ (Separar)│    │ (Conferir)│   │(Embalar) │    │(Etiqueta)│    │(Despacho)│
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### Picking — Separação

```
FLUXO DE PICKING:

1. Pedidos pagos entram na fila de picking (prioridade por SLA)
   Prioridade:
   - P1: Same Day → deve ser despachado em até 3 horas
   - P2: Express → até 12 horas
   - P3: Standard → até 24 horas
   - P4: Click & Collect → até 2 horas (na loja)

2. Sistema gera PICK LIST agrupada:
   - Agrupa pedidos por localização no armazém/loja
   - Otimiza rota de picking (mínimo deslocamento)
   - Exibe na tela do coletor/tablet:
     │ Corredor │ Prateleira │ SKU          │ Qtd │ Pedido       │
     │ A        │ A3-02      │ LGS-SCULPT-M │ 1   │ PED-2027-045 │
     │ A        │ A3-05      │ TOP-POWER-P  │ 1   │ PED-2027-045 │
     │ B        │ B1-01      │ SHR-RUN-G    │ 2   │ PED-2027-048 │

3. Operador escaneia cada item (barras ou RFID)
4. Sistema valida: item correto + quantidade certa
5. Se divergência → bloqueia e alerta supervisor
6. Picking concluído → status: READY_FOR_CHECKING
```

### Checking — Conferência

```
CONFERÊNCIA PRÉ-EMBALAGEM:

1. Segundo operador confere itens separados (segregação de funções)
2. Escaneia cada peça e confronta com o pedido
3. Verifica:
   □ SKU correto (modelo, cor, tamanho)
   □ Peça sem defeitos visuais
   □ Etiqueta de preço presente
4. Aprovado → READY_FOR_PACKING
5. Reprovado → Retorna ao picking com motivo
```

### Packing — Embalagem

```
EMBALAGEM:

1. Sistema sugere tipo de embalagem baseado no volume:
   - 1 peça leve (top, short): Envelope 30×40cm
   - 1-2 peças (leggings): Caixa P (25×20×10cm)
   - 3-5 peças (conjuntos): Caixa M (35×25×15cm)
   - 6+ peças: Caixa G (45×35×20cm)

2. Operador embala + inclui:
   □ Nota fiscal impressa
   □ Cartão de agradecimento (branding)
   □ Guia de troca/devolução com QR Code
   □ Material promocional (opcional, definido pelo marketing)

3. Registra peso e dimensões reais (para frete)
4. Status → PACKED
```

### Labeling — Etiqueta de Transporte

```
GERAÇÃO AUTOMÁTICA DE ETIQUETA:

1. Ao embalar, sistema chama API da transportadora:
   
   Integrações disponíveis:
   │ Transportadora │ API          │ SLA      │ Uso                    │
   │ Correios       │ SIGEP Web    │ 3-15 dias│ Interior, custo baixo  │
   │ Jadlog         │ REST API     │ 2-7 dias │ Capitais e interior    │
   │ Loggi          │ REST API     │ 1-3 dias │ Same day, express      │
   │ Kangu          │ REST API     │ Variável │ Agregador multi-transp │
   │ Melhor Envio   │ REST API     │ Variável │ Cotação + etiqueta     │

2. Retorno da API: código de rastreio + PDF da etiqueta
3. Etiqueta impressa automaticamente
4. Código de rastreio vinculado ao pedido
5. Evento disparado: order.shipped
6. Notificação ao cliente:
   - Email: "Seu pedido foi enviado! Rastreie: [link]"
   - WhatsApp: Mensagem template com código

7. Tracking automático:
   - CRON a cada 2 horas consulta status nas transportadoras
   - Atualiza status do pedido: IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
   - Notifica cliente a cada mudança de status
```

---

## 5.2 Logística Reversa (Devoluções e Trocas)

### Contexto
Taxa de devolução no e-commerce de moda fitness: **12% a 18%**. Principais motivos:
- Tamanho errado (~55%)
- Cor diferente do esperado (~15%)
- Defeito de fabricação (~10%)
- Arrependimento (~20%)

### Fluxo de Devolução — Automatizado

```
┌────────────────┐
│ Cliente solicita│
│ troca/devolução │
│ (site ou app)   │
└───────┬────────┘
        │
┌───────▼────────┐
│ VALIDAÇÃO      │
│ Prazo OK? (7d) │
│ Motivo? Fotos? │
└───────┬────────┘
        │
   ┌────┴─────┐
   │          │
┌──▼──┐  ┌───▼───┐
│ SIM │  │  NÃO  │
│     │  │Negar  │
└──┬──┘  │+motivo│
   │     └───────┘
┌──▼──────────────┐
│ GERAR CÓDIGO DE │
│ POSTAGEM REVERSA│
│ (API Correios/  │
│  transportadora)│
└───────┬─────────┘
        │
┌───────▼─────────┐
│ CLIENTE POSTA   │
│ (autoatendimento│
│  com etiqueta)  │
└───────┬─────────┘
        │
┌───────▼─────────┐
│ RECEBIMENTO NO  │
│ CD / LOJA       │
└───────┬─────────┘
        │
┌───────▼──────────────────────────────────────────────┐
│ INSPEÇÃO RIGOROSA                                     │
│                                                       │
│ □ Peça íntegra (sem sinais de uso)                    │
│ □ Etiquetas originais presentes                       │
│ □ Sem odores (perfume, suor, etc.)                    │
│ □ Sem manchas, descoloração ou pilling                │
│ □ Costuras íntegras                                   │
│ □ Embalagem original (quando aplicável)               │
│                                                       │
│ RESULTADO:                                            │
│ ✅ APROVADO → Produto volta ao estoque como "Novo"    │
│ ⚠️ APROVADO COM RESSALVA → Estoque "Outlet/Saldo"    │
│ ❌ REPROVADO → Não aceitar devolução OU               │
│    descarte/doação (se defeito de fábrica)            │
│                                                       │
│ 📸 TODAS as inspeções são fotografadas e registradas  │
└───────┬──────────────────────────────────────────────┘
        │
   ┌────┴────────────────────────────┐
   │                                 │
┌──▼─────────────┐    ┌─────────────▼───────┐
│ SE DEVOLUÇÃO:  │    │ SE TROCA:           │
│                │    │                     │
│ Opções:        │    │ 1. Reservar novo SKU│
│ 1. Estorno     │    │ 2. Enviar novo item │
│    (mesmo meio │    │ 3. Se diferença de  │
│     de pgto)   │    │    preço: cobrar ou │
│ 2. Vale-compras│    │    gerar crédito    │
│    (imediato)  │    │                     │
└────────────────┘    └─────────────────────┘
```

### Entidade: ReturnRequest

```
ReturnRequest {
  id                UUID (PK)
  code              VARCHAR(20) UNIQUE       -- "DEV-2027-000456"
  orderId           UUID (FK → Order)
  customerId        UUID (FK → Customer)
  type              ENUM                     -- RETURN, EXCHANGE
  status            ENUM                     -- Vide máquina de estados
  reason            ENUM                     -- WRONG_SIZE, COLOR_MISMATCH, DEFECT, REGRET, OTHER
  reasonDetail      TEXT NULL
  
  -- Postagem Reversa
  reverseTrackingCode  VARCHAR(50) NULL
  reverseCarrier       ENUM NULL
  reversePostageUrl    VARCHAR(500) NULL     -- Link para etiqueta de postagem
  postedAt             TIMESTAMP NULL
  receivedAt           TIMESTAMP NULL
  
  -- Inspeção
  inspectedAt          TIMESTAMP NULL
  inspectedById        UUID (FK → User) NULL
  inspectionResult     ENUM NULL             -- APPROVED, APPROVED_WITH_NOTE, REJECTED
  inspectionNotes      TEXT NULL
  inspectionPhotos     VARCHAR(500)[] NULL    -- URLs das fotos no S3
  
  -- Resolução
  resolution           ENUM NULL             -- REFUND, STORE_CREDIT, EXCHANGE_SENT
  refundAmount         DECIMAL(10,2) NULL
  storeCreditAmount    DECIMAL(10,2) NULL
  exchangeOrderId      UUID (FK → Order) NULL
  resolvedAt           TIMESTAMP NULL
  
  createdAt            TIMESTAMP
  updatedAt            TIMESTAMP
  deletedAt            TIMESTAMP NULL
}
```

### Itens da Devolução

```
ReturnRequestItem {
  id                UUID (PK)
  returnRequestId   UUID (FK → ReturnRequest)
  orderItemId       UUID (FK → OrderItem)
  variantId         UUID (FK → ProductVariant)
  quantity          INTEGER
  reason            ENUM                     -- Motivo específico deste item
  
  -- Inspeção por item
  inspectionResult  ENUM NULL               -- APPROVED, OUTLET, REJECTED, DISPOSED
  
  -- Troca
  exchangeVariantId UUID (FK → ProductVariant) NULL  -- Novo SKU desejado
  
  UNIQUE(returnRequestId, orderItemId)
}
```

### Máquina de Estados — Devolução

```
  ┌──────────┐     ┌───────────┐     ┌───────────┐     ┌────────────┐
  │ REQUESTED│────▶│ POSTAGE   │────▶│ POSTED    │────▶│ RECEIVED   │
  │          │     │ GENERATED │     │(em trânsito│     │ (no CD)    │
  └──────────┘     └───────────┘     └───────────┘     └─────┬──────┘
                                                             │
  ┌──────────┐     ┌───────────┐                       ┌─────▼──────┐
  │ RESOLVED │◀────│ APPROVED  │◀──────────────────────│ INSPECTING │
  │(estorno/ │     │           │                       │            │
  │ crédito) │     └───────────┘                       └─────┬──────┘
  └──────────┘                                               │
                                                       ┌─────▼──────┐
                                                       │ REJECTED   │
                                                       │(reenviado  │
                                                       │ ao cliente)│
                                                       └────────────┘
```

### SLAs de Logística Reversa

| Etapa | SLA | Ação se exceder |
|-------|-----|-----------------|
| Gerar etiqueta de postagem | Imediato (< 5 min) | Automático via API |
| Cliente postar | 7 dias úteis | Lembrete D+3, cancelar D+7 |
| Inspeção após recebimento | 24 horas | Alerta ao supervisor |
| Liberação de estorno/crédito | 2 horas após inspeção | Automático |
| Envio de item de troca | 24 horas após inspeção | Prioridade P1 no picking |

### Preservação de Higiene — Peças Íntimas e Fitness

```
PROTOCOLO DE HIGIENE PARA PEÇAS DEVOLVIDAS:

⚠️ REGRAS ESPECIAIS PARA MODA FITNESS:
  - Peças com contato íntimo (leggings, tops, bodys):
    → Inspeção mais rigorosa
    → Verificar ausência de sinais de uso (odor, marcas, deformação)
    → Se houver QUALQUER dúvida de uso: NÃO retornar ao estoque
    → Classificar como "Outlet" com desconto ou descarte

  - Peças com protetor higiênico violado:
    → Rejeição automática (política clara no site)

  - Peças aprovadas para retorno ao estoque:
    → Reembalar em embalagem original nova
    → Registrar como "inspecionado" com data e responsável
```

### Eventos — Módulo LOG

| Evento | Trigger | Dados |
|--------|---------|-------|
| `fulfillment.picking_started` | Início da separação | orderId, pickerId |
| `fulfillment.picking_completed` | Separação concluída | orderId, items[] |
| `fulfillment.packed` | Embalagem concluída | orderId, weight, dimensions |
| `fulfillment.shipped` | Despacho com rastreio | orderId, trackingCode, carrier |
| `fulfillment.delivered` | Entrega confirmada | orderId, deliveredAt |
| `return.requested` | Solicitação de devolução | returnId, orderId, reason |
| `return.postage_generated` | Etiqueta reversa gerada | returnId, trackingCode |
| `return.received` | Peça recebida no CD | returnId, receivedAt |
| `return.inspected` | Inspeção concluída | returnId, result, notes |
| `return.resolved` | Estorno/crédito emitido | returnId, resolution, amount |
| `return.rejected` | Devolução rejeitada | returnId, reason |
