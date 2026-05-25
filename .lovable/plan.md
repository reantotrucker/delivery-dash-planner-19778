## Localização exata do cliente + Anexo de canhotos (NFe/NFCe)

Duas features para o controle das rotas:
1. Campo de **Localização exata** (coordenadas/link) preenchido pelo Comercial
2. Anexo de **canhotos assinados** via câmera com auto-exclusão em 30 dias

---

### 1. Localização exata do cliente (Comercial)

**Backend**
- Adicionar coluna `location_link` (text) na tabela `routes`
- Atualizar RLS: permitir que Comercial faça UPDATE apenas desse campo (nova policy específica)

**Frontend**
- Novo botão **"Colar Localização"** no card da rota (visível para Admin e Comercial)
- Ao clicar, abre Popover com:
  - Textarea para colar link do Google Maps / Waze / coordenadas (ex: `-3.1019,-60.0250`)
  - Botão "Colar da área de transferência" (usa `navigator.clipboard.readText()`)
  - Botão Salvar
- Se já houver localização salva, o botão muda para **"Ver Localização"** (verde) e abre direto o link
- O botão Google Maps/Waze existente passa a usar `location_link` quando disponível (mais preciso que endereço)
- Adicionar também ao `RouteForm` e `RouteEditDialog` para edição completa

---

### 2. Canhotos assinados (NFe/NFCe) via câmera

**Backend**
- Nova tabela `route_receipts`:
  - `route_id` (FK)
  - `file_path` (caminho no storage)
  - `uploaded_by` (uuid)
  - `expires_at` (default `now() + 30 dias`)
- Bucket privado `route-receipts` no storage
- Políticas RLS:
  - Admin e Motorista: inserir, ver, excluir
  - Comercial: visualizar
- Limpeza automática via `pg_cron` (diário às 03:00): apaga registros + arquivos com `expires_at < now()`

**Frontend**
- Novo botão **"Canhoto"** no card da rota (ao lado de "Ocorr.", "Produtos")
- Badge no botão com a contagem de canhotos anexados
- Componente `RouteReceiptDialog.tsx`:
  - Botão **"Tirar Foto"** usando `<input type="file" accept="image/*" capture="environment">` (câmera traseira no celular)
  - Botão alternativo **"Escolher arquivo"** (desktop)
  - Lista de canhotos anexados (thumbnails) com data de upload e dias restantes para expirar
  - Visualizar em tamanho grande (lightbox)
  - Excluir anexo (Admin/Motorista)

---

### Detalhes técnicos

- Upload via `supabase.storage.from('route-receipts').upload()` com path `{route_id}/{timestamp}.jpg`
- URLs assinadas (1h) para visualização — bucket privado
- Limite 10 MB por foto; compressão client-side via canvas se >2 MB
- Atributo `capture="environment"` abre câmera traseira no mobile e cai no seletor padrão no desktop
- Função SQL `cleanup_expired_receipts()` agendada via `pg_cron`

### Fora do escopo
- Edição/recorte de foto
- OCR do canhoto
- Notificação antes da expiração
- Captura automática de GPS do navegador (apenas colar link/coords manualmente)
