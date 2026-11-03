CREATE TABLE public.interior_reopened_orders (
  pedido_id text PRIMARY KEY,
  numero_pedido text,
  motivo text,
  reopened_by uuid,
  reopened_by_name text,
  reopened_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.interior_reopened_orders TO authenticated;
GRANT ALL ON public.interior_reopened_orders TO service_role;

ALTER TABLE public.interior_reopened_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock 360 users can view reopened interior orders"
ON public.interior_reopened_orders FOR SELECT TO authenticated
USING (public.has_company_access(auth.uid(), (SELECT id FROM public.companies WHERE slug = 'stock360')));

CREATE POLICY "Stock 360 checkers can reopen interior orders"
ON public.interior_reopened_orders FOR INSERT TO authenticated
WITH CHECK (
  reopened_by = auth.uid()
  AND public.has_company_access(auth.uid(), (SELECT id FROM public.companies WHERE slug = 'stock360'))
  AND NOT (public.has_role(auth.uid(), 'comercial') AND NOT public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Stock 360 users can clear reopened interior orders"
ON public.interior_reopened_orders FOR DELETE TO authenticated
USING (public.has_company_access(auth.uid(), (SELECT id FROM public.companies WHERE slug = 'stock360')));