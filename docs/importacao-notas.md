# Importação de notas de fornecedores

Tela: `/dashboard/notas-fiscais/importar`, acessível em Entradas de Mercadoria e Importar catálogo.

1. Enviar XML autorizado de NF-e modelo 55, PDF do DANFE ou fotos de todas as páginas.
2. Conferir os dados, escolher o estoque e distribuir as peças por cor e tamanho. É possível vincular variantes existentes ou criar produtos novos, informando categoria e preço de venda. O preenchimento de categoria e multiplicador de preço pode ser aplicado em lote.
3. Salvar a conferência para continuar depois ou confirmar a entrada. Ler o documento e salvar a conferência não movimentam estoque.

A nota pode agrupar cores e tamanhos em uma única linha. O sistema exige que a distribuição some a quantidade da nota; não inventa informações ausentes. PDFs e fotos só são aceitos quando a leitura identifica a chave, os itens e os totais consistentes. Outras diagramações, leitura incompleta, caixas ou quantidades fracionadas devem ser conferidas por outro processo; o XML é preferível para leitura estruturada.

## Leitores de PDF e imagem

No computador de desenvolvimento, na pasta do projeto, executar uma vez:

```powershell
npm run invoices:setup
```

O comando instala versões fixas de PDF.js, Tesseract.js e português, atualiza `package.json` e `package-lock.json` e prepara arquivos em `public/vendor/invoice`. Depois da instalação, incluir os dois arquivos de dependências na revisão e publicação. Em instalações limpas, `npm ci` instala os leitores e `npm run build` prepara os arquivos públicos novamente. Os arquivos gerados não entram no Git.

As dependências dos leitores fazem parte de `package.json` e `package-lock.json`. O build falha se não conseguir preparar seus arquivos, evitando publicar uma instalação sem PDF/OCR.

A leitura ocorre no navegador, com bibliotecas e modelo de OCR servidos pelo próprio site. A API recebe somente os dados extraídos e conferidos. O arquivo original não é armazenado. O computador da cliente não precisa instalar Node nem um serviço para importar notas.

## Gravação e duplicidade

- Exige permissão `imports:write`; rascunhos pertencem ao usuário que os enviou.
- Criação da nota, cadastros, itens, estoque, auditoria e conclusão ocorrem na mesma transação.
- Reenvio da confirmação do mesmo rascunho retorna o resultado anterior. A chave de acesso impede outra entrada com a mesma NF-e, inclusive em outro formato.
- Números com zeros à esquerda também são comparados com entradas antigas por fornecedor. A importação XLSX compartilha a trava de entrada e essa proteção.
- Novos custos recebem o rateio do total da nota, incluindo frete e desconto. Produtos existentes mantêm seus custos e preços cadastrados; o custo desta entrada fica nos itens da nota.
- Não cria contas a pagar. Nenhuma alteração de schema/migração é necessária.

## Verificação

```powershell
npm test -- tests/invoice-document.test.ts
npm run test:integration -- tests/integration/invoice-receipt.test.ts tests/integration/operations.test.ts
```

Os testes de integração usam PostgreSQL descartável em loopback e substituem ambas as URLs do banco. Não apontar testes para produção. Para validar a interface, usar uma base separada e notas sintéticas; a nota inicial da cliente já pode ter estoque cadastrado.

Em 16/11/2026, o PDF original e imagens PNG de suas duas páginas foram lidos no Chrome com as regras de conteúdo da produção: 22 itens, 130 peças, R$ 4.390,50 em produtos, R$ 355,76 de frete e R$ 4.746,26 no total. Também foi validado um XML sintético. Uma imagem renderizada do PDF não substitui testes de fotos de câmera com inclinação ou iluminação ruim.

O OCR pode confundir letras e números nos códigos e descrições. A conferência permite corrigi-los explicitamente, mantendo a leitura original no histórico. Códigos repetidos com descrições diferentes bloqueiam a criação de novos produtos até serem conferidos. A leitura não adivinha dígitos; totais e quantidades precisam fechar antes de salvar o rascunho inicial.
