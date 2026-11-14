# Recibo da Donna Ticy — modelo B

Implementado em 14/11/2026 conforme o segundo modelo escolhido: nome da loja em texto, subtítulo MODA FITNESS, variantes por cor/tamanho, quantidade total de peças, abatimentos separados, política de troca, Code 128 do pedido e Instagram.

O layout HTML e os cálculos de apresentação ficam em `print-service/receipt-layout.js`, compartilhado com `receipt-builder.js`. A aplicação importa apenas esse módulo puro, sem dependências de Windows. Os dois arquivos `receipt-layout.js` e `.d.ts` são incluídos no deploy; o restante do serviço continua exclusivo do caixa.

Os itens, preços e identificação do vale vêm da resposta da venda gravada. A API retorna também o valor do cupom calculado durante a transação, sem recalculá-lo no cliente. Desconto manual, cupom e vale não são descontados novamente dos itens no recibo: as linhas dos produtos mostram os valores brutos e os abatimentos aparecem abaixo do subtotal. Os pagamentos na primeira via mostram o valor entregue, com o troco separado. Não há alteração na regra financeira de gravação dos pagamentos.

Configuração por ambiente (exige reiniciar desenvolvimento ou novo build):

- `NEXT_PUBLIC_RECEIPT_TAGLINE`: subtítulo; padrão `MODA FITNESS`.
- `NEXT_PUBLIC_RECEIPT_EXCHANGE_POLICY`: texto da imagem aprovada por padrão; vazio oculta a seção.
- `NEXT_PUBLIC_STORE_INSTAGRAM`: padrão `@donnaticy`; vazio oculta.
- `NEXT_PUBLIC_RECEIPT_TIMEZONE`: padrão `America/Manaus`.
- `NEXT_PUBLIC_STORE_CNPJ`, `NEXT_PUBLIC_STORE_ADDRESS`, `NEXT_PUBLIC_STORE_PHONE`: só aparecem quando preenchidos. Dados fictícios da imagem não foram incluídos.

O código de barras contém o código exato do pedido, com margens em branco. Códigos incompatíveis ou maiores que 20 caracteres aparecem apenas em texto, evitando barras cortadas. A tela de trocas já busca pedidos pelo código completo. O teste técnico impresso não cria um pedido: seu código não será encontrado na tela de trocas.

O serviço deve estar rodando no PC do caixa e a flag `NEXT_PUBLIC_FEATURE_RECEIPT_PRINTING` deve estar habilitada para impressão automática. O teste direto via fila do Windows valida o layout físico, mas não substitui a validação do serviço HTTP e da venda pelo navegador.

Esta entrega implementa o modelo B. Logo raster, edição da política pelo painel e botão de segunda via, propostos no documento de 12/11, não fazem parte desta alteração.
