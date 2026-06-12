# Guia de Migração para Outra Conta Lovable

Este projeto pode ser transferido para outra conta Lovable usando GitHub como ponte. O código frontend, edge functions e toda a estrutura do banco (22 migrations versionadas) viajam junto.

> **Importante:** este guia leva apenas o **sistema** — não os dados. Banco, usuários, fotos e canhotos começam do zero na nova conta.

---

## Passo 1 — Conectar este projeto ao GitHub (conta de origem)

1. No editor Lovable, clique no botão **+** (canto inferior esquerdo do chat)
2. Selecione **GitHub → Connect project**
3. Autorize o Lovable GitHub App
4. Clique em **Create Repository** — todo o código vai para o repositório novo

---

## Passo 2 — Dar acesso ao repo para a outra conta

Opção A (recomendada): no GitHub, adicione o usuário da outra conta como colaborador do repositório.
Opção B: torne o repositório público (cuidado: o código fica visível para todos).

---

## Passo 3 — Criar projeto novo na outra conta Lovable

1. Logar na outra conta Lovable
2. Criar um projeto novo em branco
3. Conectar ao mesmo repositório GitHub (botão **+** → GitHub → Connect)
4. O código sincroniza automaticamente

---

## Passo 4 — Ligar Lovable Cloud na nova conta

1. Habilitar Cloud no projeto novo
2. As **22 migrations** rodam automaticamente e recriam:
   - Enum `app_role` (admin, user, motorista, comercial)
   - Tabelas: `profiles`, `user_roles`, `routes`, `route_products`, `route_occurrences`, `route_occurrence_photos`, `route_receipts`, `drivers`, `vehicles`, `consultants`, `payment_methods`, `omie_cache`
   - Funções: `has_role`, `handle_new_user`, `update_updated_at`, `clean_omie_cache`, `cleanup_expired_receipts`, `prevent_profile_email_change`, `admin_set_profile_email`
   - Trigger `on_auth_user_created` no `auth.users`
   - Buckets de Storage: `route-occurrences`, `route-receipts`
   - Cron jobs (limpeza automática de canhotos antigos e cache Omie)
   - Todas as policies RLS e GRANTs

---

## Passo 5 — Configurar Secrets na nova conta

Em **Project Settings → Secrets**, adicionar:

| Secret | Onde obter |
|---|---|
| `OMIE_APP_KEY` | Painel Omie → Integrações → API → App Key |
| `OMIE_APP_SECRET` | Painel Omie → Integrações → API → App Secret |

> `LOVABLE_API_KEY` e os `SUPABASE_*` são provisionados automaticamente — não precisa mexer.

---

## Passo 6 — Configurar autenticação

### Email/senha
Já vem ativado por padrão. Funciona imediatamente.

### Google OAuth (opcional, recomendado)
1. No projeto novo: **Cloud → Auth → Providers → Google → Enable**
2. Configurar OAuth credentials no Google Cloud Console (Client ID + Secret)
3. Copiar a Redirect URL que o Lovable mostrar e colar nas configurações do Google

---

## Passo 7 — Criar o primeiro admin

O sistema tem um trigger que **automaticamente** torna admin quem cadastrar com email `renato@stock360.com.br`.

Se quiser mudar o email de admin automático antes de migrar, edite a função `handle_new_user` nas migrations ou crie uma migration nova alterando-a.

Caso prefira tornar outro email admin manualmente após o cadastro:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'seu@email.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

---

## Passo 8 — Cadastrar dados iniciais

Logado como admin na nova conta, acesse:

1. **`/users`** — cadastrar motoristas, comercial e outros admins
2. **`/settings`** — cadastrar:
   - Motoristas (com cor associada)
   - Veículos
   - Consultores comerciais
   - Formas de pagamento

---

## Passo 9 — Publicar

1. Clicar em **Publish** no canto superior direito
2. Nova URL `.lovable.app` é gerada
3. (Opcional) Conectar domínio customizado em **Project Settings → Domains**

---

## Checklist final

- [ ] Repo GitHub conectado nas duas contas
- [ ] Cloud habilitado na nova conta (migrations executadas)
- [ ] Secrets `OMIE_APP_KEY` e `OMIE_APP_SECRET` configurados
- [ ] Google OAuth configurado (se aplicável)
- [ ] Primeiro admin cadastrado
- [ ] Motoristas, veículos, consultores e formas de pagamento cadastrados em `/settings`
- [ ] Sistema publicado

---

## O que NÃO migra (resumo)

| Item | Migra? |
|---|---|
| Código frontend e edge functions | Sim (via GitHub) |
| Estrutura do banco (tabelas, RLS, funções, triggers, buckets) | Sim (via migrations) |
| Dados nas tabelas (rotas, clientes Omie, ocorrências) | Não |
| Usuários cadastrados | Não |
| Arquivos no Storage (fotos, canhotos) | Não |
| Secrets (Omie, Google OAuth) | Não — reconfigurar |
| Domínio customizado | Não — reconectar |
