# Módulo 03 — Vendas e Jornada Omnichannel (`SAL`)

> **VISÃO-ALVO — não descreve a implementação atual.** Ver `00-VISAO-GERAL.md`.

## 3.1 Interface de PDV com CRM Integrado

### Layout da Tela de Checkout (PDV)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🔍 Buscar produto (nome, SKU, código de barras, RFID)                  │
├─────────────────────────────────┬────────────────────────────────────────┤
│                                 │                                        │
│   CARRINHO DE VENDA             │   👤 PERFIL DO CLIENTE                 │
│                                 │                                        │
│   ┌─────────────────────────┐   │   Ana Souza — ⭐ VIP Gold             │
│   │ Legging Sculpt V2       │   │   📞 (11) 99999-1234                  │
│   │ Preta - M               │   │   📧 ana@email.com                    │
│   │ R$ 189,90          ×1   │   │                                        │
│   ├─────────────────────────┤   │   Último compra: 12/01/2027            │
│   │ Top Power X             │   │   Ticket médio: R$ 312,00             │
│   │ Rosa - P                │   │   Tamanho preferido: M (top) / M (leg)│
│   │ R$ 129,90          ×1   │   │   Cor favorita: Preto (62%)           │
│   ├─────────────────────────┤   │   Total gasto: R$ 4.680,00            │
│   │ Desconto conjunto: -10% │   │                                        │
│   └─────────────────────────┘   │   ─── ÚLTIMAS COMPRAS ───             │
│                                 │   12/01 - Legging Run Pro - R$ 169,90  │
│   Subtotal:      R$ 319,80     │   15/10 - Conjunto All Day - R$ 349,90 │
│   Desconto:     - R$ 31,98     │   22/08 - 2x Tops Training - R$ 199,80 │
│   TOTAL:         R$ 287,82     │                                        │
│                                 │   ─── CROSS-SELL SUGERIDO ───         │
│   ┌────────┐  ┌────────┐       │   💡 "Ana compra tops a cada ~4 meses" │
│   │ DINHEIRO│  │ CARTÃO │       │   💡 "Sugerir meias de compressão"     │
│   ├────────┤  ├────────┤       │   💡 "Oferecer conjunto -10%"           │
│   │  PIX   │  │ VALE   │       │                                        │
│   └────────┘  └────────┘       │   ─── PONTOS FIDELIDADE ───           │
│                                 │   Saldo: 1.240 pts (= R$ 62,00)       │
│   [FINALIZAR VENDA]            │   [RESGATAR PONTOS]                    │
│                                 │                                        │
├─────────────────────────────────┴────────────────────────────────────────┤
│  Vendedor: Maria Silva │ Loja: Shopping Ibirapuera │ Caixa #02          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Funcionalidades do PDV

1. **Identificação do cliente**: CPF, telefone, nome ou cartão fidelidade
2. **Histórico inline**: Últimas 10 compras visíveis sem sair do checkout
3. **Preferências automáticas**: Sistema detecta tamanhos e cores frequentes
4. **Cross-sell inteligente**:
   - Baseado em combos frequentes (legging + top = conjunto com desconto)
   - Baseado em ciclo de recompra do cliente
   - Baseado em itens complementares (meias, acessórios)
5. **Programa de fidelidade**: Acúmulo e resgate de pontos diretamente no checkout
6. **Pagamento múltiplo**: Combinar 2+ meios de pagamento na mesma venda
7. **Operação offline**: Cache local para vendas quando sem internet (sync posterior)

### Identificação do Cliente — Fluxo

```
CHECKOUT INICIADO:
  
  1. Vendedor escaneia/digita primeiro produto
  2. Sistema solicita identificação do cliente:
     
     → CPF/Telefone encontrado:
        Carregar perfil completo + sugestões de cross-sell
     
     → Não encontrado:
        Exibir "Novo cliente? [Cadastro rápido]"
        Cadastro mínimo: Nome + Telefone + CPF (opcional)
        Campos adicionais preenchidos pós-venda (email, data nasc.)
     
     → Cliente recusa identificação:
        Venda como "consumidor final" (NFC-e sem CPF)
        Cross-sell genérico baseado em produtos do carrinho
```

---

## 3.2 Canais de Venda Integrados

### Mapa de Canais

```
                    ┌─────────────────────┐
                    │   ESTOQUE ÚNICO     │
                    │   (Single Source     │
                    │    of Truth)        │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     ┌────────▼───────┐ ┌────▼────┐ ┌────────▼───────┐
     │  LOJA FÍSICA   │ │  E-COM  │ │  SOCIAL        │
     │  (PDV)         │ │         │ │  COMMERCE      │
     └────────┬───────┘ └────┬────┘ └────────┬───────┘
              │               │               │
     ┌────────▼───────┐ ┌────▼────┐ ┌────────▼───────┐
     │ Venda presencial│ │ Site    │ │ WhatsApp       │
     │ Click&Collect   │ │ App     │ │ Instagram Shop │
     │ Prova na loja   │ │ Market  │ │ Link de pgto   │
     └────────────────┘ └─────────┘ └────────────────┘
```

### Canal 1: Loja Física (PDV)

```
FLUXO LOJA FÍSICA:

1. Cliente entra na loja → Vendedor aborda
2. Identificação: CPF/telefone no PDV
3. Atendimento consultivo com base no perfil CRM
4. Produtos escaneados (barras ou RFID)
5. Cross-sell sugerido pelo sistema
6. Pagamento processado
7. NFC-e/NF-e emitida automaticamente
8. Pontos fidelidade creditados
9. Eventos disparados:
   - order.placed
   - stock.updated (baixa imediata)
   - payment.confirmed
```

### Canal 2: E-commerce

```
FLUXO E-COMMERCE:

1. Cliente navega no site/app
2. Estoque exibido = availableQty (real-time via API)
3. Ao adicionar ao carrinho:
   - Reserva temporária (15 min) → stock.reserved
4. Checkout:
   - Identificação (login ou guest + CPF)
   - Endereço + frete (APIs transportadoras)
   - Pagamento (gateway: Pagar.me, Stripe, etc.)
5. Pagamento confirmado:
   - payment.confirmed → order.confirmed
   - Estoque: reserva vira baixa definitiva
   - Pedido entra na fila de picking (LOG)
6. NF-e emitida automaticamente
7. Código de rastreio enviado (email + WhatsApp)
```

### Canal 3: Click & Collect (Compre Online, Retire na Loja)

```
FLUXO CLICK & COLLECT:

1. Cliente compra pelo e-commerce
2. Seleciona "Retirar na loja [X]"
3. Sistema verifica estoque ESPECÍFICO da loja selecionada
   (não do CD — a peça precisa estar fisicamente lá)
4. Se disponível:
   - Reserva o item na loja
   - Gera QR Code de retirada
5. Loja recebe notificação → Separar produtos
6. Loja confirma separação → Status: READY_FOR_PICKUP
7. Cliente recebe notificação: "Seus itens estão prontos!"
8. Na loja:
   - Cliente apresenta QR Code
   - Vendedor escaneia → Confirma entrega
   - Oportunidade de cross-sell presencial
9. SLA: Produto separado em até 2 horas após a compra
```

### Canal 4: WhatsApp Business (Social Commerce)

```
FLUXO WHATSAPP COMMERCE:

1. Cliente envia mensagem via WhatsApp
   - Pode ser orgânico ou via campanha CRM
2. Vendedor atende (ou chatbot para triagem inicial)
3. Vendedor consulta catálogo no sistema:
   - Busca produtos, verifica estoque em tempo real
   - Envia fotos e detalhes via WhatsApp (catálogo API)
4. Cliente confirma interesse
5. Vendedor gera LINK DE PAGAMENTO no sistema:
   - Link contém: itens, preço, desconto, dados do cliente
   - Link expira em 30 minutos
   - Estoque reservado ao gerar o link → stock.reserved
6. Cliente paga pelo link (Pix, cartão)
7. Pagamento confirmado:
   - Reserva convertida em pedido → order.placed
   - Se entrega: entra na fila de picking
   - Se retirada: fluxo Click & Collect
8. Vendedor recebe comissão atribuída

PROTEÇÃO CONTRA VENDA NEGATIVA:
  - Link expirado sem pagamento → stock.released
  - Se estoque zerou entre a conversa e o link:
    → Vendedor recebe alerta em tempo real
    → Alternativa: sugerir cor/tamanho similar disponível
```

---

## 3.3 Sincronização de Estoque — Arquitetura Real-Time

### Problema: Venda Negativa

A **venda negativa** ocorre quando um canal vende uma peça que já não existe no estoque. É especialmente grave no social commerce, onde a conversa pode durar minutos entre consulta e pagamento.

### Solução: Estoque Centralizado com CQRS + Event Streaming

```
ARQUITETURA DE SINCRONIZAÇÃO:

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│   PDV    │  │  E-COM   │  │ WHATSAPP │  │ CLICK&C  │
│  (write) │  │  (write) │  │  (write) │  │  (write) │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │              │              │              │
     └──────────────┴──────┬───────┴──────────────┘
                           │
                    ┌──────▼──────┐
                    │  COMMAND    │
                    │  SERVICE   │  ← Validação + Lock otimista
                    │ (Write DB) │
                    └──────┬─────┘
                           │
                    ┌──────▼──────┐
                    │   EVENT     │
                    │   STREAM   │  ← stock.updated (Kafka/Redis Streams)
                    │             │
                    └──────┬─────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼─────┐ ┌───▼────┐ ┌────▼────┐
       │  READ DB   │ │ CACHE  │ │ SEARCH  │
       │ (réplica)  │ │ Redis  │ │ Elastic │
       └────────────┘ └────────┘ └─────────┘
              │            │            │
     ┌────────┴────────────┴────────────┴────┐
     │        QUERY SERVICE (Read)            │
     │  Todos os canais leem daqui            │
     │  Latência: < 50ms                      │
     └────────────────────────────────────────┘
```

### Estratégia de Lock para Evitar Overselling

```
RESERVA DE ESTOQUE (operação atômica):

// Usa lock otimista com versão
function reserveStock(variantId, locationId, qty):
  BEGIN TRANSACTION
    position = SELECT * FROM stock_positions
      WHERE variant_id = $variantId 
        AND location_id = $locationId
      FOR UPDATE -- Lock pessimista a nível de registro
    
    IF position.available_qty < qty:
      ROLLBACK
      THROW InsufficientStockError
    
    UPDATE stock_positions SET
      reserved_qty = reserved_qty + qty,
      updated_at = NOW()
    WHERE id = position.id
    
    INSERT INTO stock_reservations (variant_id, location_id, qty, 
      expires_at, order_ref)
    VALUES ($variantId, $locationId, $qty, NOW() + INTERVAL '15 min', $ref)
  COMMIT
  
  EMIT event: stock.reserved { variantId, locationId, qty, ref }

// Auto-expiração de reservas
CRON a cada 1 minuto:
  UPDATE stock_positions sp
  SET reserved_qty = reserved_qty - sr.qty
  FROM stock_reservations sr
  WHERE sr.variant_id = sp.variant_id
    AND sr.location_id = sp.location_id
    AND sr.expires_at < NOW()
    AND sr.status = 'ACTIVE'
  
  UPDATE stock_reservations SET status = 'EXPIRED' 
  WHERE expires_at < NOW() AND status = 'ACTIVE'
  
  Para cada reserva expirada: EMIT stock.released
```

### Latência por Canal

| Canal | Atualização de Estoque | Meta de Latência |
|-------|----------------------|------------------|
| PDV (mesma loja) | Síncrona (na transação) | < 100ms |
| E-commerce (catálogo) | Event stream → Cache | < 200ms |
| WhatsApp (consulta) | Query via cache Redis | < 150ms |
| Click & Collect | Query filtrada por loja | < 200ms |
| Marketplace (Mercado Livre, etc.) | Webhook/API batch | < 5s |

---

## 3.4 Entidades de Venda

### Order (Pedido Unificado)

```
Order {
  id              UUID (PK)
  code            VARCHAR(20) UNIQUE       -- "PED-2027-000123"
  channel         ENUM                     -- STORE, ECOMMERCE, CLICK_COLLECT, WHATSAPP, MARKETPLACE
  status          ENUM                     -- Máquina de estados abaixo
  
  -- Cliente
  customerId      UUID (FK → Customer)
  
  -- Loja/Origem
  locationId      UUID (FK → Location)     -- Loja de origem
  sellerId        UUID (FK → User) NULL    -- Vendedor (se loja/whatsapp)
  
  -- Valores
  subtotal        DECIMAL(10,2)
  discountTotal   DECIMAL(10,2) DEFAULT 0
  shippingCost    DECIMAL(10,2) DEFAULT 0
  total           DECIMAL(10,2)
  
  -- Endereço (se entrega)
  shippingAddress  JSONB NULL
  deliveryMethod   ENUM NULL               -- PICKUP, STANDARD, EXPRESS, SAME_DAY
  
  -- Rastreamento
  trackingCode    VARCHAR(50) NULL
  
  -- Timestamps
  placedAt        TIMESTAMP
  paidAt          TIMESTAMP NULL
  shippedAt       TIMESTAMP NULL
  deliveredAt     TIMESTAMP NULL
  cancelledAt     TIMESTAMP NULL
  
  createdAt       TIMESTAMP
  updatedAt       TIMESTAMP
  deletedAt       TIMESTAMP NULL
}
```

### Máquina de Estados — Pedido (canal e-commerce/WhatsApp)

```
  ┌────────┐     ┌──────────┐     ┌────────────┐     ┌──────────┐
  │ PENDING │────▶│  PAID    │────▶│  PICKING   │────▶│  PACKED  │
  │ PAYMENT │     │          │     │            │     │          │
  └────┬───┘     └──────────┘     └────────────┘     └─────┬────┘
       │                                                     │
       │         ┌──────────┐     ┌────────────┐     ┌──────▼────┐
       │         │DELIVERED │◀────│ IN TRANSIT │◀────│  SHIPPED  │
       │         │          │     │            │     │           │
       │         └──────────┘     └────────────┘     └───────────┘
       │
       └──▶ CANCELLED (timeout 30min sem pagamento → auto-cancelar)
       
  Qualquer status antes de SHIPPED → CANCELLED (com estorno se pago)
```

### Eventos — Módulo SAL

| Evento | Trigger | Dados |
|--------|---------|-------|
| `order.placed` | Novo pedido | orderId, channel, items[], customerId |
| `order.paid` | Pagamento confirmado | orderId, paymentMethod, amount |
| `order.picking` | Início da separação | orderId, locationId |
| `order.packed` | Embalagem concluída | orderId, packageDimensions |
| `order.shipped` | Despacho | orderId, trackingCode, carrier |
| `order.delivered` | Entrega confirmada | orderId, deliveredAt |
| `order.cancelled` | Cancelamento | orderId, reason, refundAmount |
| `payment_link.created` | Link de pagamento (WhatsApp) | linkId, orderId, amount, expiresAt |
| `payment_link.expired` | Link expirou sem pagamento | linkId, orderId |
