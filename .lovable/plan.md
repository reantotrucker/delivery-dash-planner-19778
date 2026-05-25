# Redesign da barra de ações do card de rota

## O que muda visualmente
Substituir a linha apertada de 4 botões (Produtos · Canhoto · Ocorr. · Reagendar) por uma **grade 2x2 de tiles** com ícone grande colorido em cima e label curto embaixo. Os botões de Editar/Excluir continuam como estão, abaixo da grade.

Cada tile:
- Fundo `bg-secondary/40`, borda sutil, cantos `rounded-xl`
- Ícone dentro de um quadrado colorido tonal (azul para Produtos, vermelho para Canhoto, cinza para Ocorr., âmbar para Reagendar)
- Label uppercase pequena (`text-[10px]`) embaixo
- Badge de contagem flutuante no canto (Canhoto vermelho, Ocorr. vermelho)
- Animação leve: `active:scale-95`, ícone cresce no hover

Tudo respeita o design system (tokens semânticos), sem cores fixas no JSX além das classes tonais já permitidas para destaque.

## Onde mexer
Arquivo: `src/components/routes/RouteTable.tsx`

- Trocar o container `flex flex-wrap gap-1.5` (linha ~518) por `grid grid-cols-2 gap-2`.
- Reescrever os 4 botões (Produtos, Canhoto, Ocorr. trigger do DropdownMenu, Reagendar trigger do Popover) para o formato tile vertical (`flex-col`, ícone em caixa colorida, label embaixo). Conteúdo do DropdownMenu e do Popover permanece igual.
- Manter `isAdmin`, `canManageOccurrences`, `receiptCount`, `productCount`, `routeOccurrences` e handlers existentes.
- Bloco de Editar/Excluir (linhas 687–729) permanece intacto.

## Nada de backend
Mudança puramente visual no `RouteTable.tsx`. Sem migrações, sem novos componentes, sem alteração de dados.
