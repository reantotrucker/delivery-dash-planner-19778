# Botão Volume + etiquetas 100x50mm

## O que muda no card da rota

Um novo botão **Volume** aparece no card de cada rota (todas as lojas), ao lado dos botões atuais.

Ao clicar, abre uma janela simples:
- Campo com a quantidade de volumes, já preenchida com o que veio da nota do Omie (quando a nota informa volumes).
- Se a nota não informar, o campo vem vazio para digitação manual.
- Sempre é possível corrigir o número na mão e salvar.
- Botão **Imprimir etiquetas**.

O botão mostra a quantidade salva (ex: "Volume 5") para dar visibilidade de que já foi preenchido.

## A etiqueta

Uma folha de impressão com uma etiqueta por volume, 100x50 mm cada, tema claro, sem sombras, pensada para impressora de adesivos. Se forem 5 volumes, saem 5 etiquetas: 1/5, 2/5, 3/5, 4/5, 5/5.

Conteúdo de cada etiqueta:
- **Remetente**: dados da loja (nome, CNPJ, endereço, cidade/UF, CEP, telefone).
- **Destinatário**: cliente, endereço, bairro, cidade/UF, CEP.
- **NF**: número da nota (lido da observação da rota quando existir, ou digitável na janela de volumes).
- **Volume X/Y** em destaque grande, data e motorista/placa quando houver.

Impressão pelo próprio navegador (janela de impressão), com o tamanho de página fixado em 100x50 mm para sair alinhado no adesivo.

## Cadastro do remetente

Em **Configurações** entra um bloco "Dados da empresa (etiqueta)" para preencher e editar, por loja: razão social, CNPJ, endereço, bairro, cidade, UF, CEP e telefone. A etiqueta usa automaticamente os dados da loja ativa.

## Volume automático do Omie

Na busca de notas passamos a ler a quantidade de volumes informada na nota e a gravar na rota no momento da importação. Quando a nota não trouxer esse dado, o campo fica em branco para preenchimento manual.

## Detalhes técnicos

- Migração: colunas `volumes` (int) e `nfe_number` (text) em `routes`; colunas de remetente em `companies` (`legal_name`, `cnpj`, `address`, `neighborhood`, `city`, `state`, `cep`, `phone`). Política de escrita em `companies` restrita a Admin.
- `supabase/functions/omie-invoices/index.ts`: expor `volumes` a partir de `transp.vol[].qVol` (soma) na NF-e; `OmieImport.tsx` grava esse valor ao criar a rota.
- Novo `src/components/routes/RouteVolumeDialog.tsx`: edição de volumes/NF + gatilho de impressão.
- Novo `src/components/routes/EtiquetaVolumesPrint.tsx`: view de impressão isolada (iframe + `window.print()`), `@page { size: 100mm 50mm; margin: 0 }`, uma etiqueta por página, seguindo o padrão já usado no relatório de expedição em PDF.
- `RouteTable.tsx`: botão Volume no bloco de ações (Admin/Expedição/Motorista podem editar; Comercial apenas visualiza e imprime).
