# Estrutura da DonnaTicy

## Objetivo

Separar o projeto da DonnaTicy do projeto da Alldav para evitar:
- mistura de ambiente
- banco compartilhado
- credenciais cruzadas
- permissões conflitantes

## Recomendação

- 1 repositório por projeto
- 1 banco por projeto
- 1 conjunto de `.env` por projeto
- 1 base de dados distinta para produção

## Estrutura de Pastas

- app/ ou src/
- prisma/
- public/
- scripts/
- docs/
- tests/

## Credenciais que devem ficar em ambiente local/seguro

- DATABASE_URL
- DIRECT_DATABASE_URL
- JWT_SECRET
- MFA_ENCRYPTION_KEY
- CRON_SECRET

Esses valores devem ser preenchidos no `.env.local` real, nunca no repositório público.
