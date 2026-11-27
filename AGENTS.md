# AGENTS.md

- Calls to external partner systems that need a private key go through a dedicated authenticated edge function proxy (e.g. `interior-proxy` for Stock360 Vendas); the browser never sees the key.
- Data is isolated per company via `company_id` and the active company from `useCompany`; company-specific menus are gated by company slug or flags in both `AppSidebar` and `MobileNav`.
- Interior-delivery state that Stock360 Vendas cannot store (admin exclusions, reopened conferences, post-send corrections) lives in local tables keyed by the upstream `pedido_id` and is applied by `interior-proxy` when listing; upstream status stays the source of truth.
- Corrections to interior orders already sent to Omie are saved locally and pushed by `interior-proxy` directly to Omie (`AlterarPedidoVenda` on the same order, removed items sent with their original quantity), because Stock360 Vendas refuses to re-save sent orders.
- Interior product swipe checks are browser-local progress scoped by user, order, product quantity and reopening timestamp; they never modify quantities or automatically save/send orders to Omie.
- Interior quantity/deletion/volume edits autosave as per-user, company-scoped drafts with an upstream base version and browser fallback; only explicit conference save/send actions confirm or transmit orders.
- Returning interior orders for authorization uses the authenticated partner action; never emulate approval locally, because Stock360 Vendas owns the approval workflow.
- Interior "who is conferring" indicators use Realtime Presence per company (no table); presence is ephemeral and never blocks editing.
- SmartGPS tracking links vehicles by normalized plate (`vehicles.plate_normalized`, no IMEI) through the `smartgps-proxy` edge function, which resolves and stores `smartgps_device_id` and keeps the API hash server-side.
