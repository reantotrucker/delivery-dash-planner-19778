CREATE TABLE public.interior_excluded_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id text NOT NULL UNIQUE,
  numero_pedido text,
  cliente text,
  motivo text,
  excluded_by uuid,
  excluded_by_name text,
  excluded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.interior_excluded_orders TO authenticated;
GRANT ALL ON public.interior_excluded_orders TO service_role;

ALTER TABLE public.interior_excluded_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock 360 users can view excluded interior orders"
ON public.interior_excluded_orders FOR SELECT TO authenticated
USING (public.has_company_access(auth.uid(), (SELECT id FROM public.companies WHERE slug = 'stock360')));

CREATE POLICY "Admins can exclude interior orders"
ON public.interior_excluded_orders FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND excluded_by = auth.uid());

CREATE POLICY "Admins can restore interior orders"
ON public.interior_excluded_orders FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));