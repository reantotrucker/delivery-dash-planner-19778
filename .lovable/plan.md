

## Plano: Sugestão Inteligente de Ordem de Rotas com IA

### O que será feito

Um botão "Sugerir Ordem" no Dashboard que, ao ser clicado, envia os endereços das rotas filtradas (por motorista e período) para a IA, que retorna a sequência otimizada de entregas. O sistema então atualiza automaticamente o `order_number` de cada rota.

### Como funciona

1. **Botão no Dashboard** - Ao lado dos filtros de motorista/busca, um botão "Sugerir Ordem" (ícone de rota/mapa) aparece quando há rotas filtradas por um motorista específico.

2. **Edge Function `optimize-route-order`** - Recebe a lista de rotas (id, client, address, neighborhood, cep) e usa o modelo `google/gemini-2.5-flash` via Lovable AI Gateway para analisar os endereços em Manaus e retornar a ordem otimizada de entrega (minimizando deslocamento).

3. **Atualização automática** - Com a resposta da IA, o sistema atualiza o `order_number` de cada rota no banco e recarrega a lista.

### Detalhes técnicos

- **Nova Edge Function**: `supabase/functions/optimize-route-order/index.ts`
  - Recebe: `{ routes: [{ id, client, address, neighborhood, cep }] }`
  - Prompt pede para ordenar por proximidade geográfica em Manaus
  - Retorna: `{ orderedIds: ["id1", "id2", ...] }`

- **Dashboard (`src/pages/Dashboard.tsx`)**:
  - Botão "Sugerir Ordem" visível apenas quando um motorista específico está selecionado no filtro
  - Ao clicar, invoca a edge function com as rotas filtradas
  - Atualiza `order_number` de cada rota (1, 2, 3...) via batch update
  - Toast de sucesso/erro + refetch

- **Sem alterações no banco** - Usa o campo `order_number` já existente na tabela `routes`

