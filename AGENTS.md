# AGENTS.md

- Calls to external partner systems that need a private key go through a dedicated authenticated edge function proxy (e.g. `interior-proxy` for Stock360 Vendas); the browser never sees the key.
- Data is isolated per company via `company_id` and the active company from `useCompany`; company-specific menus are gated by company slug or flags in both `AppSidebar` and `MobileNav`.
