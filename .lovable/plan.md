## Aplicar novo layout dos cards de rota

Refatorar `src/components/routes/RouteTable.tsx` para usar o layout escolhido (Blueprint logístico em 2 colunas).

### Estrutura do novo card

- **Barra colorida vertical à esquerda** (cor do motorista, mantém identificação visual)
- **Coluna esquerda — Roteirização** (`flex-1`):
  - Topo: rótulo "Rota" + número grande em fonte mono (#1, #2…) | badge de status (PEND/OK, clicável) + Consultor à direita
  - Meio: nome do cliente em destaque + bairro (cor do motorista) + endereço em itálico
  - Rodapé: links Google Maps + Waze com ícones
- **Coluna direita — Operacional** (largura fixa `md:w-72`, fundo `bg-muted/20`):
  - Grid 2x2 com labels minúsculas: Motorista, Placa (fonte mono), Pagamento (badge), Produtos (X/Y · X/Y)
  - Bloco de Observação em destaque (se houver)
  - Barra de ações: Produtos, Ocorr., Reagendar (full width) + Editar/Excluir lado a lado como ícones
- Preserva: indicador "URGENTE", ring vermelho, popover de reagendar, dropdown de ocorrências, dialogs.
- Grid externo: `grid-cols-1 xl:grid-cols-2` (2 colunas só em telas grandes pois cada card agora é mais largo).

### Fora de escopo

- Nenhuma mudança de lógica/backend
- Sem mudanças em RouteForm, dialogs, ou outras páginas
