# Login por usuário

A tela aceita usuário ou e-mail. O usuário é único, não diferencia maiúsculas e permite de 3 a 40 letras ASCII, números, pontos, hífens e sublinhados. O e-mail continua associado à conta; nome, permissões, vendas e histórico não mudam.

## Configurar uma conta existente

Após publicar o código, na pasta do projeto com a conexão do banco correto em `.env.local`:

```powershell
npm run db:deploy
powershell -NoProfile -File scripts/set-user-login.ps1
```

O comando lista as contas ativas. Escolha a conta pelo número, informe o novo usuário e digite a nova senha duas vezes. A senha fica oculta durante a digitação, não é salva em arquivo e não é passada como argumento de processo. O banco recebe apenas o hash bcrypt.

A ferramenta preserva as permissões, o e-mail e o 2FA. Ela encerra as sessões anteriores, limpa o bloqueio por tentativas e registra a operação na auditoria. Não cria contas nem reativa contas desativadas. Usuário duplicado cancela a operação inteira.

Esta ferramenta local exige acesso administrativo ao banco e aceita as senhas compatíveis com o login existente (6 a 72 bytes, no mínimo 6 caracteres). O cadastro e a troca de senha pela interface mantêm suas validações atuais. Não existe rota pública para redefinir credenciais.

O usuário só funciona no site após a publicação desta versão e a aplicação da migração `20261114000200_user_login`.
