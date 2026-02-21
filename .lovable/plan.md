
# Redesign Visual da Tabela de Rotas

## Problemas Atuais
- Tabela densa e monocratica, dificil de escanear visualmente
- Status "OK" e "SOMENTE ENTREGAR" sem destaque claro
- Colunas de acao (icones) pequenas e sem clareza
- Pagamento sem destaque visual
- Linhas muito similares entre si, sem separacao visual clara

## Melhorias Propostas

### 1. Status com Badges Coloridos
Substituir o botao simples por badges com cores fortes e iconografia:
- **ENTREGUE**: Badge verde solido com icone de check
- **NAO_ENTREGUE / PEND**: Badge vermelho/amarelo com icone de alerta
- Tamanho maior e mais legivel

### 2. Pagamento com Badges
Transformar texto plano de pagamento em badges compactos com cores distintas:
- PIX: badge azul
- BOLETO: badge amarelo/amber
- CARTAO CREDITO: badge roxo
- DINHEIRO: badge verde
- SOMENTE ENTREGAR: badge cinza

### 3. Linhas Alternadas com Melhor Contraste
- Melhorar o contraste entre linhas pares e impares
- Manter a cor do motorista mas com melhor opacidade
- Adicionar hover mais visivel

### 4. Header da Tabela Mais Destacado
- Fundo mais escuro no header
- Borda inferior mais grossa separando do conteudo
- Texto em uppercase com letter-spacing

### 5. Coluna de Acoes Reorganizada
- Icones com tooltips mais claros
- Separacao visual entre grupos de acoes
- Tamanho dos icones levemente maior para facilitar clique

### 6. Cliente em Destaque
- Nome do cliente com fonte bold e cor mais clara/branca
- Truncar com ellipsis de forma mais elegante

---

## Detalhes Tecnicos

### Arquivo modificado
- `src/components/routes/RouteTable.tsx`

### Mudancas especificas

**Header**: Adicionar `bg-card/80 border-b-2 border-primary/30` no `TableRow` do header.

**Status**: Criar componente inline com `Badge` colorido:
```text
ENTREGUE  ->  Badge variant verde com check icon
PENDENTE  ->  Badge variant vermelho/amber
```

**Pagamento**: Criar funcao `getPaymentBadgeStyle(name)` que retorna classes Tailwind por tipo de pagamento.

**Linhas**: Melhorar alternancia com `even:bg-muted/20 odd:bg-background` e `hover:bg-muted/40 transition-colors`.

**Cliente**: `text-foreground font-bold` em vez de `font-medium`.

**Acoes**: Aumentar de `h-5 w-5` para `h-6 w-6` no mobile e manter `sm:h-7 sm:w-7`, adicionar `rounded-md` nos botoes.
