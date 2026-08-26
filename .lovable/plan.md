# Segunda empresa (Uniprint Manaus) + Expedição + Painel de TV

## O que muda

O sistema passa a operar duas empresas independentes: a atual (Stock 360) e a nova **Uniprint Manaus**, cada uma com sua própria chave de integração Omie. Os dados nunca se misturam: rotas, ocorrências, produtos, canhotos e localizações passam a pertencer a uma empresa.

A **Expedição e o painel de TV são exclusivos da Uniprint Manaus** (que tem venda balcão). A Stock 360 continua exatamente como está hoje, sem etapa de expedição e sem nenhuma mudança de fluxo.

```text
Venda NF-e / NFC-e (Omie)
        |
   Painel de TV  ->  avisa o pessoal para separar
        |
     EXPEDIÇÃO   ->  confere o pedido e decide:
        |                 |
   VENDA BALCÃO       ENVIAR PARA ROTA
   (card verde)       (entra na separação de rotas normal)
```

## 1. Empresas e acesso

- Cadastro de empresas: Stock 360 e Uniprint Manaus.
- Um usuário pode participar de **várias** empresas; o admin define isso na tela de Usuários (checkbox por empresa).
- Seletor de empresa no topo do app (sidebar/mobile). Todas as telas — Dashboard, Ocorrências, Localizações, Relatórios, Importação Omie, Configurações — passam a filtrar pela empresa ativa.
- Cadastros próprios por empresa: motoristas, veículos, consultores, formas de pagamento.

## 2. Chaves Omie

- As chaves atuais continuam servindo a Stock 360.
- Serão solicitadas as chaves da Uniprint (App Key e App Secret) como novos segredos.
- A importação Omie usa a chave da empresa ativa; o cache é separado por empresa.

## 3. Novo perfil: Expedição

- Novo perfil de usuário **Expedição**, usado apenas na Uniprint, que vê somente a fila de Expedição e o painel de TV.
- Admin também tem acesso total à Expedição.

## 4. Tela de Expedição (Uniprint)

- Fila com os pedidos vindos da NF-e/NFC-e ainda não conferidos.
- Ao abrir um pedido: lista de itens para conferência (mesmo padrão do checklist de produtos já existente).
- Dois botões de destino:
  - **Venda balcão** — o card fica **verde**, marcado como venda balcão, e permanece no histórico da expedição.
  - **Enviar para rota** — o card fica marcado como enviado para rota e cria a rota, entrando no fluxo de separação/entrega atual.
- O card sempre mostra o destino escolhido (balcão ou rota), com data/hora e quem conferiu.
- Filtros por data, status (aguardando / balcão / rota) e busca por cliente ou número da nota.

## 5. Painel de TV

- Rota nova em tela cheia (`/tv`), pensada para televisão: fontes grandes, contraste alto, atualização automática em tempo real.
- Seletor de empresa (Stock 360, Uniprint ou ambas) para escolher o que é exibido.
- Mostra as vendas recém-emitidas aguardando separação, com destaque para novas entradas (animação + aviso sonoro opcional) e contador de pendentes.
- Pedidos já conferidos saem da tela de chamadas e aparecem em uma faixa de "concluídos recentes" com a cor do destino.

## Detalhes técnicos

- Tabelas novas: `companies`, `user_companies` (usuário ↔ empresa), `expedition_orders` (empresa, nota/pedido, cliente, valor, status `AGUARDANDO | BALCAO | ROTA`, conferido_por, conferido_em, `route_id`) e `expedition_order_items`.
- Coluna `company_id` (NOT NULL, com backfill para a empresa atual) em `routes`, `drivers`, `vehicles`, `consultants`, `payment_methods`, `route_occurrences`, `route_products`, `route_receipts`; `omie_cache` recebe empresa na chave.
- Novo valor `expedicao` no enum `app_role`; função `has_company_access(user_id, company_id)` SECURITY DEFINER; RLS de todas as tabelas passa a exigir empresa liberada para o usuário, com GRANTs correspondentes.
- Segredos: `OMIE_APP_KEY_UNIPRINT` / `OMIE_APP_SECRET_UNIPRINT`; a função `omie-invoices` recebe `company_id` e resolve a chave correta.
- Realtime habilitado em `expedition_orders` para alimentar o painel de TV.
- Contexto React `CompanyProvider` (empresa ativa persistida) consumido pelas queries existentes.

## Ordem de execução

1. Migração de banco (empresas, vínculos, `company_id`, expedição, perfil, RLS).
2. Chaves da Uniprint + ajuste da função Omie.
3. Contexto de empresa + seletor + filtro nas telas atuais.
4. Tela de Expedição e criação de rota a partir dela.
5. Painel de TV.
6. Vínculo usuário ↔ empresa na tela de Usuários.
