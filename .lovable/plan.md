## Objetivo

Mostrar NF-e e NFC-e juntas em uma única lista no Omie Import, ordenadas por data/hora de emissão (depois pelo número), para facilitar a organização por horário.

## Mudanças em `src/pages/OmieImport.tsx`

1. **Remover o Tabs NF-e / NFC-e** (linhas ~581-586). Buscar sempre os dois tipos.

2. **Buscar os dois em paralelo** usando `useQueries` (em vez de um `useQuery` único):
   - Query 1: `omie-invoices` com `type: 'nfe'`, mesma `currentPage`.
   - Query 2: `omie-invoices` com `type: 'nfce'`, mesma `currentPage`.
   - `isLoading` = qualquer uma carregando; `error` = primeiro erro.

3. **Merge das listas**: anotar cada invoice com `docType: 'nfe' | 'nfce'` e concatenar. Manter o sort já existente (data/hora desc, depois número desc).

4. **Cor por tipo de documento** (linha ~726 e no card do item):
   - NF-e → texto e badge em vermelho (`text-red-500`).
   - NFC-e → texto e badge em azul (`text-blue-500`).
   - Trocar o `activeTab === 'nfe' ? 'NF-e' : 'NFC-e'` por `invoice.docType === 'nfe' ? 'NF-e' : 'NFC-e'` com a classe de cor aplicada ao título da nota.

5. **Contador de resultados** (linha ~683): somar os dois (`data1.totalRecords + data2.totalRecords`, `data1.invoices.length + data2.invoices.length`). Pagination mostra "Página X" comum às duas — manter a maior `totalPages` entre as duas.

6. **Dialog de criação de rota** (já usa `dialogInvoice`): adicionar a mesma cor no título ao abrir.

## Detalhes técnicos

- O tipo `OmieInvoice` ganha um campo opcional `docType?: 'nfe' | 'nfce'` setado no merge (não vem do backend).
- O state `activeTab` é removido; queryKey passa a usar `['omie-invoices-combined', currentPage, fetchCounter]` para cada tipo.
- O badge "✓ Rota criada" continua usando `normalizeNfNumber` — sem mudança.
- Edge function `omie-invoices` não muda.

## Fora de escopo

- Não alterar lógica de criação de rota, cache ou pagination interna do Omie.
- Não mexer no formato BRL nem no destaque verde de rota criada.
