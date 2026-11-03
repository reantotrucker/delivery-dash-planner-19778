# AGENTS.md

- Calls to external partner systems that need a private key go through a dedicated authenticated edge function proxy (e.g. `interior-proxy` for Stock360 Vendas); the browser never sees the key.
- Data is isolated per company via `company_id` and the active company from `useCompany`; company-specific menus are gated by company slug or flags in both `AppSidebar` and `MobileNav`.
- Interior-delivery state that Stock360 Vendas cannot store (admin exclusions, reopened conferences, post-send corrections) lives in local tables keyed by the upstream `pedido_id` and is applied by `interior-proxy` when listing; upstream status stays the source of truth.
- Corrections to interior orders already sent to Omie are saved locally and pushed by `interior-proxy` directly to Omie (`AlterarPedidoVenda` on the same order, removed items sent with their original quantity), because Stock360 Vendas refuses to re-save sent orders.
