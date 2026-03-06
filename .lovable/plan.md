
# Redesign: Tabela de Rotas para Layout em Cards

## Visao Geral
Substituir o layout de tabela atual por um grid de cards modernos, mais visuais e faceis de ler. Cada rota sera representada por um card individual com todas as informacoes organizadas de forma clara.

## Design dos Cards

Cada card tera a seguinte estrutura:

```text
+--------------------------------------------------+
|  [#1]  NOME DO CLIENTE              [OK] badge    |
|  Bairro: Centro  |  Consultor: Joao              |
|  Endereco: Rua ABC, 123        [Maps] [Waze]     |
|  ------------------------------------------------ |
|  [Motor: Carlos]  [Veic: ABC-1234]  [PIX badge]  |
|  ------------------------------------------------ |
|  [Produtos 2/3]  [Ocorr. 1]  [Editar]  [Excluir] |
+--------------------------------------------------+
```

- Borda lateral esquerda com a **cor do motorista** (5px de espessura)
- Fundo do card com leve tonalidade da cor do motorista
- Rotas urgentes com borda vermelha e indicador visual
- Status como badge grande e clicavel no canto superior direito
- Pagamento como badge colorido (PIX azul, BOLETO amber, etc.)
- Botoes de acao na parte inferior do card, maiores e mais acessiveis

## Layout Responsivo
- **Desktop (lg+)**: Grid de 2 colunas
- **Tablet (md)**: Grid de 2 colunas
- **Mobile**: 1 coluna, cards empilhados com scroll

## Detalhes Tecnicos

### Arquivo modificado
- `src/components/routes/RouteTable.tsx`

### Mudancas principais

1. **Remover estrutura de Table** (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`) e substituir por `div` com grid layout usando classes Tailwind `grid grid-cols-1 md:grid-cols-2 gap-3`.

2. **Criar estrutura de Card** para cada rota usando o componente `Card` existente:
   - Header: numero da rota + nome do cliente (bold, grande) + badge de status clicavel
   - Body: informacoes organizadas em linhas (bairro, endereco com links Maps/Waze, consultor)
   - Separador visual
   - Footer: motorista, veiculo, badge de pagamento, e botoes de acao

3. **Borda lateral colorida**: Usar `borderLeft: 5px solid ${route.driver?.color}` inline style no card.

4. **Status badge**: Manter os badges ja criados (verde ENTREGUE, vermelho PENDENTE), posicionados no canto superior direito.

5. **Acoes**: Botoes maiores com texto visivel (nao apenas icones), dispostos horizontalmente no footer do card.

6. **Manter toda a logica existente**: toggleStatus, deleteRoute, deleteOccurrence, dialogs (ProductChecklist, RouteOccurrence, RouteEdit, AlertDialog de exclusao) permanecem inalterados.

7. **Estado vazio**: Exibir mensagem centralizada "Nenhuma rota cadastrada" quando `routes.length === 0`.

8. **Manter `getPaymentBadgeStyle`** e toda a logica de queries (routeProductCounts, occurrences).
