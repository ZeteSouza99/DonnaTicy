# Impressao USB da Donna Ticy

Versao 1.1.1: usa a porta 15555. A porta 5555 do PDV e de alguns emuladores permanece livre para esses programas. O instalador verifica ocupacao TCP mesmo quando o outro programa nao responde por HTTP.

## No computador da cliente

1. Entre no Windows com a conta usada no caixa. Use Windows 10/11 x64 (Intel/AMD).
2. Instale o driver oficial da Bematech MP-4200 TH, conecte o USB, coloque papel e confirme uma pagina de teste do Windows. O pacote nao instala drivers.
3. Extraia o ZIP inteiro para uma pasta. Clique duas vezes em **INSTALAR.cmd**. Nao execute diretamente dentro do ZIP nem em outra conta de administrador.
4. A MP-4200 TH sera selecionada automaticamente se houver uma unica fila correspondente. Havendo duvida, o instalador mostra as filas e pede o numero da impressora termica ESC/POS de 80 mm.
5. Aguarde a mensagem **INSTALADO. Servico online**.
6. Abra https://donnaticy.vercel.app/dashboard/configuracoes/impressao na mesma maquina. Clique em **Verificar conexao**, permita acesso a rede local quando solicitado e clique em **Imprimir teste**. Confira acentos, valores, codigo de barras e corte do papel.

O pacote inclui Node.js portatil e dependencias. A instalacao funciona sem npm, sem baixar programas e sem alterar o Node.js do computador. O site precisa de internet. O instalador nao cria venda nem imprime por conta propria.

## Inicio automatico e recuperacao

Os arquivos sao copiados para `%LOCALAPPDATA%\DonnaTicy\PrintService`, fora da pasta extraida. Um atalho exclusivo da Donna Ticy fica na pasta Inicializar da conta atual. O processo inicia sem janela **quando essa conta entra no Windows**, nao antes do login. Nao e um servico do Windows executado como SYSTEM.

O supervisor evita duas instancias na mesma conta, reinicia o processo quando ele termina e verifica sua resposta a cada 15 segundos. Tres falhas de resposta provocam reinicio. As tentativas tem intervalo de 5 a 60 segundos. Recibos nao sao reenviados automaticamente, evitando copias duplicadas. O status online confirma o servico, nao confirma papel saindo da impressora.

Use uma conta de caixa por computador. Duas contas simultaneas disputam a porta 15555. Se o Windows ou um administrador desabilitar o atalho em Aplicativos de Inicializacao, reative-o ou execute INSTALAR novamente. O supervisor nao altera politicas corporativas.

Depois de instalar, **reinicie o PC, entre na conta do caixa e use Verificar conexao sem executar nenhum script**. Esse e o teste de aceite do inicio automatico.

## Manutencao

| Arquivo | Uso |
| --- | --- |
| INSTALAR.cmd | Instalar, reinstalar ou atualizar; preserva a configuracao existente. |
| INICIAR.cmd | Iniciar manualmente sem duplicar uma instancia existente. |
| REINICIAR.cmd | Reiniciar somente os processos desta instalacao. |
| PARAR.cmd | Parar ate o proximo login ou acionamento de Iniciar. |
| DIAGNOSTICO.cmd | Mostrar fila, porta, spooler, estado do servico e local dos logs. |
| DESINSTALAR.cmd | Parar e remover o inicio automatico; preserva arquivos, configuracao e logs. |

Esses comandos tambem estao na pasta da versao instalada, em `releases`. Os logs ficam em `%LOCALAPPDATA%\DonnaTicy\PrintService\logs`. O instalador guarda as versoes anteriores; se a ativacao de uma atualizacao falhar, tenta restaurar a versao anterior. Nao apague versoes enquanto o programa estiver em uso.

Para trocar explicitamente a fila ou o site, abra o PowerShell na pasta extraida:

```powershell
.\setup.ps1 -PrinterName 'NOME EXATO DA FILA' -SiteUrl 'https://donnaticy.vercel.app'
```

Em ambientes que exigem invocacao explicita, use `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1` com os mesmos parametros. O escopo dessa opcao e apenas o processo; o instalador nao altera a politica de execucao do Windows.

Se a porta 15555 estiver ocupada por uma instalacao antiga, encerre essa instalacao antes de continuar. O instalador nao mata todos os processos Node.js e nao remove atalhos de outros sistemas PDV.

## O que verificar quando nao imprime

- Servico offline: execute DIAGNOSTICO; confira o inicio automatico e os logs. REINICIAR tenta recuperar o servico.
- Servico online, sem papel: confira energia, USB, papel, fila pausada/offline e o Spooler do Windows. Confirme que o nome da fila corresponde a impressora termica correta.
- Navegador sem conexao: permita acesso a rede local apenas para o site da Donna Ticy. A permissao pertence ao navegador e precisa ser concedida nele; o instalador nao a altera.
- Impressao incorreta: confirme modo ESC/POS e bobina de 80 mm. Outros modelos dependem de compatibilidade com os comandos usados.
- Antigo atalho `PDV Print Service`: remova somente apos confirmar que ele e da instalacao anterior da Donna Ticy. Pode pertencer a outro sistema.

O servidor escuta apenas `127.0.0.1:15555` e aceita a origem configurada. Nao e preciso abrir porta no roteador nem criar regra de entrada no firewall.

## Para gerar uma nova versao do pacote

O desenvolvedor executa `package-release.ps1` com o Node.js x64 e seu arquivo LICENSE, depois de instalar as dependencias com `npm ci --ignore-scripts --omit=dev` em `print-service`. O gerador usa uma lista explicita de arquivos: nao inclui config.json, dados da loja, credenciais ou arquivos .env.

O pacote usa Node.js v24.22.1 x64, cujo SHA-256 e conferido contra o publicado em https://nodejs.org/en/blog/release/v24.22.1 . Consulte `runtime/LICENSE` para as licencas do Node.js e as pastas dos modulos para as licencas das dependencias. Atualizacoes do runtime exigem nova versao do pacote com hash revisado.
