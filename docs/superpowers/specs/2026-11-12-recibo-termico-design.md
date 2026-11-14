# Recibo do cliente na Bematech MP-4200 TH

> Atualização de 14/11/2026: o usuário escolheu o modelo B (nome em texto). A implementação atual está em [recibo-modelo-b.md](../../recibo-modelo-b.md). O escopo abaixo permanece como proposta histórica, não como descrição de funcionalidades concluídas.

Data: 2026-11-12. Status: em revisão.

## Intenção

A loja quer entregar ao cliente um recibo impresso na hora da venda, na mesma impressora térmica que o projeto `pdv` usa (Bematech MP-4200 TH, 80 mm) e pela mesma estrutura: o navegador manda os dados para um serviço local no PC do caixa, que monta os comandos ESC/POS e envia para a fila do Windows.

O DonnaTicy já tem essa estrutura copiada do `pdv` (`print-service/` e `src/lib/print.ts`), mas a impressão está desligada em produção (`NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING=false`), os dados da loja não existem e o recibo atual é o genérico do `pdv`. Este trabalho desenha o recibo de uma loja de roupa, liga os dados da loja ao banco e acrescenta a reimpressão.

A impressora fica num PC usado só pelo DonnaTicy, com o mesmo modelo de impressora do `pdv`. A porta 5555 e o serviço existente servem sem conflito.

## Metas

- Recibo do cliente no layout aprovado (modelo C, desenho abaixo), com logo impresso em preto e branco.
- Impressão automática ao finalizar a venda no PDV, como no `pdv`.
- Botão "Imprimir recibo" no detalhe do pedido para reimprimir.
- Dados da loja (CNPJ, endereço, telefone, Instagram, política de troca) gravados na tabela `settings` e editados em Configurações > Parâmetros Gerais, sem novo deploy.
- Código de barras CODE128 com o código do pedido, que o leitor da loja lê no campo de busca da tela de troca (`src/app/dashboard/vendas/troca/page.tsx`, campo com `autoFocus` que já busca por código do pedido).
- Com o serviço local desligado, o recibo sai pela impressão do navegador em 80 mm, como hoje.

## Fora do escopo

- Impressão do vale-troca e do comprovante de troca.
- Nota fiscal (NFC-e).
- Endereço por loja: há uma loja física ("Loja Centro"), então o endereço é um só, na configuração geral.
- Gravar o troco no pedido (ver "Reimpressão").
- Escolha de impressora pela interface. O nome da fila continua em `config.json`/`PRINTER_NAME` no PC do caixa.

## O que não pode acontecer

- A impressão travar ou desfazer a venda. `printSaleReceipt` continua sem lançar erro; falha de impressão não muda o resultado da venda.
- Abrir a janela de impressão do navegador a cada venda quando o serviço local está no ar.
- O recibo mostrar valores que não batem com o pedido gravado. Subtotal menos descontos tem que dar o total do pedido.
- Um site de outra origem conseguir imprimir. O bloqueio por `allowedOrigins` do `server.js` continua.

## Como funciona hoje

- `src/app/dashboard/vendas/page.tsx` (`finalize`, perto da linha 613) cria o pedido com `POST /api/orders` e, se `RECEIPT_PRINTING`, monta o recibo a partir do carrinho e chama `printSaleReceipt`.
- `src/lib/print.ts` consulta `GET http://127.0.0.1:5555/status` (timeout de 1,2 s, cache de 60 s online e 15 s offline) e envia `POST /print` com `{ type: "sale_receipt", data, store }`. Sem serviço, gera HTML 80 mm e chama `window.print()` (CSS em `src/app/globals.css`, seção "Impressão de comprovante 80mm").
- Os dados da loja vêm de `NEXT_PUBLIC_STORE_CNPJ`, `NEXT_PUBLIC_STORE_ADDRESS`, `NEXT_PUBLIC_STORE_PHONE` e `NEXT_PUBLIC_RECEIPT_FOOTER`, nenhuma definida em produção.
- `print-service/` é Express na porta 5555, escutando só em 127.0.0.1. `escpos.js` usa CP850, fonte A, 42 colunas, corte parcial `GS V 66 3`. `receipt-builder.js` tem só `buildSaleReceipt`. `win-print.js` + `raw-printer.ps1` mandam os bytes RAW para a fila (padrão `MP-4200 TH`).
- `next.config.ts` só libera `connect-src http://127.0.0.1:5555` quando a flag está `true`. A flag entra no build, então ligar exige variável na Vercel e novo deploy.
- A tabela `settings` (`model Setting`, `schema.prisma:569`, `key` única, `value Json`, `group`) já tem chaves como `loyalty.pointsPerReal` e `stock.reservationMinutes`. A tela `src/app/dashboard/configuracoes/parametros/page.tsx` mostra "Em construção".
- O endereço da "Loja Centro" no banco é de semente (Rua XV de Novembro, Curitiba).

### O que o pedido gravado tem e o que não tem

- `Order.discountTotal` soma cupom, desconto manual e vale-troca (`src/services/order-service.ts:312`). `Order.usedStoreCreditAmount` guarda só o vale-troca. O valor do cupom e o desconto manual não ficam separados.
- O pagamento em dinheiro é gravado já descontado do troco (o PDV reduz o último pagamento `CASH` pela sobra). O troco não fica em lugar nenhum.
- Valores `Decimal` chegam no JSON como string.
- Sem cliente informado, o pedido usa o cliente "Consumidor Final".

## Abordagens consideradas

A estrutura foi fixada pelo pedido ("a mesma estrutura que o pdv usa"): navegador → serviço local → ESC/POS. Descartamos gerar os bytes no servidor da Vercel (o serviço viraria um repasse, diferente do `pdv`), QZ Tray (outro programa para instalar e licenciar) e imprimir só por HTML (abre a janela de impressão a cada venda e o logo sai acinzentado).

A escolha que sobrou foi como o logo chega à impressora:

1. Convertido uma vez e guardado no serviço. Um script transforma o PNG em pontos preto e branco e grava um arquivo pronto em `print-service/`. O serviço só envia os bytes com `GS v 0`. O PC do caixa não instala nada a mais. Trocar o logo exige rodar o script e atualizar a pasta do serviço.
2. Convertido a cada impressão com `pngjs`. Trocar o logo é trocar o arquivo, mas o PC do caixa ganha uma dependência, e o `install.bat` só roda `npm install` quando falta `node_modules\express`, então um PC já instalado não a receberia.
3. Gravado na memória da impressora (bit image NV). Imprime mais rápido, mas exige gravar em cada impressora com o utilitário da Bematech, some se a impressora for trocada e foge do padrão do `pdv`.

O usuário escolheu a opção 1.

## Layout aprovado (modelo C)

42 colunas, fonte A, CP850. O alinhamento abaixo é ilustrativo; as regras de montagem estão na seção seguinte. Valores e dados da loja são fictícios.

```
          [ logo Donna Ticy, raster ]
         CNPJ: 00.000.000/0001-00
   Rua Exemplo, 123 - Centro, Manaus/AM
           Tel: (92) 99999-0000
------------------------------------------
           COMPROVANTE DE VENDA            (negrito)
          NÃO É DOCUMENTO FISCAL
Pedido PED-2611-A7K2QZ    12/11/2026 21:40
Vendedor(a):                     Ana Paula
Cliente:                       Maria Souza
------------------------------------------
ITEM                    QTD x UNIT   TOTAL (negrito)
Legging Compressão Zíper - Preto/M
  1 x R$ 189,90                  R$ 189,90
Top Nadador Flor - Rosa/P
  2 x R$ 89,90                   R$ 179,80
Shorts Saia Fitness - Verde Oliva/G
  1 x R$ 119,90                  R$ 119,90
------------------------------------------
Subtotal (4 peças)               R$ 489,60
Cupom BEMVINDA10                 -R$ 48,96
Vale-troca VLT-2610-K3M9Q1       -R$ 50,00
TOTAL                            R$ 390,64 (negrito, altura dupla)
------------------------------------------
PAGAMENTO                                  (negrito)
Dinheiro                         R$ 210,00
Crédito 2x                       R$ 190,64
Troco                             R$ 10,00 (negrito)
------------------------------------------
             POLÍTICA DE TROCA             (negrito)
Trocas em até 30 dias, com este
comprovante e a peça com etiqueta, sem
sinais de uso. Peças em promoção não têm
troca.
------------------------------------------
      Apresente este código na troca:
        [ CODE128: PED-2611-A7K2QZ ]
              PED-2611-A7K2QZ

        Obrigada pela preferência!
                @donnaticy
```

O protótipo navegável dos três modelos (A, B, C) foi gerado durante a conversa e não fica no repositório.

## Regras de montagem do recibo

- Cabeçalho: logo centralizado. Sem o arquivo do logo, imprime "Donna Ticy" em letra dupla (como o recibo atual). Abaixo, só as linhas preenchidas: `CNPJ: ...`, endereço (quebra por palavra se passar de 42 colunas), `Tel: ...`.
- Identificação: `Pedido <código>` à esquerda e data/hora à direita. Data/hora no fuso do PC do caixa, como hoje. `Vendedor(a):` só se o pedido tiver vendedor. `Cliente:` com o nome gravado, inclusive "Consumidor Final".
- Na reimpressão, uma linha `2ª VIA` em negrito logo abaixo de "NÃO É DOCUMENTO FISCAL".
- Itens: nome do produto, ` - `, cor `/` tamanho, com quebra por palavra. Linha seguinte com `  <qtd> x <unitário>` à esquerda e total do item à direita.
- Totais: `Subtotal (<n> peças)` com n = soma das quantidades (`1 peça` no singular). Depois as linhas de desconto, só as que tiverem valor:
  - Desconto sem vale-troca = `discountTotal - usedStoreCreditAmount`. O rótulo é `Cupom <código>` quando o pedido tem cupom e `Desconto` quando não tem. Cupom e desconto manual juntos saem numa linha só, com o rótulo do cupom. Isso evita recalcular o cupom, que pode ter sido editado depois da venda.
  - `Vale-troca <código>` com `usedStoreCreditAmount`.
  - `TOTAL` com `Order.total`.
- Pagamento: uma linha por pagamento com o rótulo do método (o mesmo usado no PDV) e `Nx` quando parcelado. Na primeira via, o dinheiro aparece com o valor entregue pelo cliente (gravado + troco) e a linha `Troco` aparece quando o troco é maior que zero. Na reimpressão, os valores gravados e sem troco.
- Política de troca: título centralizado e o texto da configuração com quebra por palavra em 42 colunas. Sem texto configurado, a seção inteira some.
- Código de barras: `Apresente este código na troca:`, CODE128 (conjunto B) com o código do pedido, e o código em texto embaixo, centralizado.
- Rodapé: `Obrigada pela preferência!` e, se configurado, o Instagram (`@` acrescentado se faltar).
- Corte parcial no fim, como hoje.

## Reimpressão

O botão "Imprimir recibo" fica no topo de `src/app/dashboard/vendas/[id]/page.tsx`, visível quando `RECEIPT_PRINTING` está ligado e o pedido não está cancelado. A reimpressão monta o recibo do pedido gravado, com `2ª VIA` e sem troco, porque o troco não é gravado. Gravar o troco exigiria migração no banco e ficou fora.

## Peças da solução

### Serviço local (`print-service/`)

- `escpos.js` ganha:
  - quebra de texto por palavra em N colunas (palavra maior que a linha é cortada);
  - imagem raster `GS v 0` a partir de largura, altura e bytes 1 bit (1 = preto), enviada em faixas para não estourar o buffer da impressora;
  - CODE128 com `GS h` (altura), `GS w` (largura do módulo), `GS H 0` (sem texto automático, o código em texto é impresso pela linha seguinte) e `GS k 73 n {B<dados>`.
- `receipt-builder.js`: `buildSaleReceipt(sale, store)` passa a montar o layout acima. Campos novos ausentes não podem quebrar a montagem (um front antigo ainda pode mandar o formato atual).
- Logo: script em `print-service/` (por exemplo `scripts/gerar-logo.js`) que lê `public/donnaticy-logo.png`, recorta a área com conteúdo, redimensiona para a largura escolhida (múltiplo de 8, até 576 pontos), aplica limiar e grava o arquivo pronto que o serviço carrega. O arquivo gerado é commitado. `pngjs` entra só como `devDependency` do `print-service`, então o `npm install --production` do `install.bat` não o instala no caixa.
- `server.js`: continua com o tipo `sale_receipt`. Sem mudança de segurança.

### Aplicação

- Tabela `settings`, grupo `store`, uma chave por campo: `store.cnpj`, `store.address`, `store.phone`, `store.instagram`, `store.exchangePolicy`. Sem migração: a tabela já existe.
- `GET /api/store-info`: devolve os cinco campos (string vazia quando não houver). Exige `requirePermission(request, "settings", "read")`, que todos os papéis têm.
- `PUT /api/store-info`: grava os campos com validação zod (tamanho máximo por campo, texto simples). Exige `settings` + `write`, hoje só `SUPER_ADMIN`. Erros por `handleApiError`, como as outras rotas.
- `GET /api/orders/[id]`: o `include` passa a trazer `usedStoreCredit.code`. `coupon.code` e `seller.name` já vêm.
- Uma função pura (por exemplo `orderToReceipt(order, { change?, reprint })` em `src/lib/`) converte o pedido da API no `SaleReceiptData`. É ela que aplica as regras de desconto, peças, pagamento e troco descritas acima, convertendo os `Decimal` em número.
- `src/lib/print.ts`:
  - `SaleReceiptData` ganha os campos do layout novo (vendedor, linhas de desconto, quantidade de peças, código para o código de barras, marcação de 2ª via).
  - Os dados da loja passam a vir de `/api/store-info`; o nome continua `brand.name`. Se a consulta falhar, imprime só com o nome.
  - Uma função pública que recebe o id do pedido (e o troco, na primeira via), busca pedido e loja, monta com `orderToReceipt` e imprime. Usada pelo PDV e pelo detalhe do pedido. Continua sem lançar erro.
  - O HTML de contingência segue as mesmas seções, com `<img src="/donnaticy-logo.png">` no topo e o código do pedido em texto, sem código de barras.
- PDV (`vendas/page.tsx`): depois do `POST /api/orders`, chama a função nova com o id do pedido criado e o troco calculado na tela. Para de montar o recibo a partir do carrinho.
- Parâmetros Gerais: o bloco "Loja e recibo" com os cinco campos (política de troca em área de texto) e botão salvar. Quem não tem `settings` + `write` vê os campos só para leitura. O aviso "em breve" das outras configurações continua.
- As variáveis `NEXT_PUBLIC_STORE_*` e `NEXT_PUBLIC_RECEIPT_FOOTER` deixam de ser usadas e saem do `.env.example`.

## Testes

Vitest, em `tests/*.test.ts`, como o resto do projeto:

- `orderToReceipt`: cupom sem desconto manual, desconto manual sem cupom, cupom com vale-troca, vale-troca sozinho, contagem de peças, troco só na primeira via, `2ª VIA` na reimpressão, valores `Decimal` em string.
- `print-service`: quebra por palavra em 42 colunas, bytes do CODE128 e do `GS v 0` (cabeçalho com largura e altura corretas), texto principal do recibo decodificado de CP850 (inclusive acentos), recibo sem logo, recibo no formato antigo sem quebrar.
- Validação do `PUT /api/store-info` (tamanhos e campos desconhecidos).
- A rota nova precisa passar em `tests/api-guards.test.ts`, que exige a guarda de permissão em todo handler de todo `route.ts`.

Os testes do `print-service` importam CommonJS que depende de `iconv-lite`, que não está no `node_modules` da raiz nem é instalado pelo CI. O construtor resolve isso (por exemplo, `iconv-lite` como `devDependency` da raiz).

## Riscos e verificação no caixa

- Este computador de desenvolvimento não tem a MP-4200 TH. O `pdv` já usa comandos do modo ESC/POS (`ESC t`, `GS !`, `GS V`), então a impressora está nesse modo, e `GS v 0` e `GS k` fazem parte dele. A confirmação de que logo e código de barras saem certos vem da primeira impressão no PC do caixa.
- Verificação manual no caixa: fazer uma venda de teste, conferir o recibo contra o pedido, ler o código de barras na tela de troca e reimprimir pelo detalhe do pedido.

## Passos para colocar no ar (cada um com confirmação do usuário)

1. Publicar o código (commit, push, deploy).
2. Preencher "Loja e recibo" em Parâmetros Gerais.
3. Instalar ou atualizar o `print-service` no PC do caixa com `install.bat`, informando a URL de produção do DonnaTicy.
4. Ligar `NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING=true` na Vercel e fazer novo deploy (a CSP só libera a porta 5555 com a flag ligada).

## Decisões deixadas ao construtor

- Largura do logo (sugestão: 400 pontos, cerca de 50 mm), limiar de preto e tamanho das faixas do `GS v 0`.
- Altura do código de barras e largura do módulo (com módulo 2, `PED-AAMM-XXXXXX` cabe em 576 pontos; com módulo 3, não).
- Formato do arquivo do logo gerado.
- Onde fica o mapa de rótulos dos métodos de pagamento compartilhado entre PDV e recibo.
- Disposição visual do bloco "Loja e recibo".
