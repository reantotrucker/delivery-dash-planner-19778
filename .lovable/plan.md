# Plano: Preparar projeto para migração via GitHub

Como você não precisa levar dados, o caminho é simples: garantir que **todo o código + estrutura do banco** esteja versionado no GitHub, para a outra conta clonar e subir um Cloud novo já com tudo pronto.

## O que vou verificar e preparar

### 1. Auditoria de migrations
- Conferir se `supabase/migrations/` contém TODAS as tabelas, funções, RLS, GRANTs e buckets atuais.
- Itens críticos que precisam estar versionados:
  - Enum `app_role`
  - Tabelas: `profiles`, `user_roles`, `routes`, `route_products`, `route_occurrences`, `route_receipts`, `drivers`, `vehicles`, `consultants`, `payment_methods`, `omie_cache`, etc.
  - Funções: `has_role`, `handle_new_user`, `update_updated_at`, `clean_omie_cache`, `cleanup_expired_receipts`, `prevent_profile_email_change`, `admin_set_profile_email`
  - Trigger `on_auth_user_created` no `auth.users` (chama `handle_new_user`)
  - Cron jobs `pg_cron` (limpeza de receipts e cache Omie)
  - Buckets de Storage: `route-occurrences`, `route-receipts` + políticas

### 2. Criar migration "consolidação" se faltar algo
Se qualquer item acima não estiver nas migrations existentes, vou criar **uma migration nova** que recria tudo via `CREATE ... IF NOT EXISTS`. Assim, ao subir o Cloud na outra conta, ela roda e deixa o banco idêntico.

### 3. Documentar setup pós-migração (README_MIGRACAO.md)
Criar um arquivo na raiz com checklist do que fazer na nova conta:
- Ligar Lovable Cloud
- Adicionar secrets: `OMIE_APP_KEY`, `OMIE_APP_SECRET`
- Ativar Google OAuth (se quiser manter login Google) + credenciais
- Criar primeiro usuário admin (email `renato@stock360.com.br` vira admin automático via trigger)
- Cadastrar motoristas/comercial em `/users`
- Cadastrar dados mestre em `/settings` (motoristas, veículos, consultores, formas de pagamento)

### 4. Conectar este projeto ao GitHub
Você faz manualmente (eu não tenho permissão):
- Botão **+** no chat (canto inferior esquerdo) → **GitHub** → **Connect project** → **Create Repository**
- Depois é só dar acesso ao repo para a outra conta (ou tornar público) e na outra conta criar projeto novo conectado ao mesmo repo.

## Resultado final

Outra conta vai:
1. Criar projeto Lovable em branco
2. Conectar ao mesmo repo GitHub
3. Ligar Cloud → migrations rodam → banco pronto
4. Adicionar 2 secrets do Omie
5. Configurar Google OAuth
6. Publicar

Sem dados antigos, sem usuários antigos — sistema limpo pronto para uso.

---

**Aprovar para eu começar?** Vou auditar as migrations, criar a consolidação se necessário, e gerar o `README_MIGRACAO.md`.
