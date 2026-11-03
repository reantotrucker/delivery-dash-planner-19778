CREATE TABLE public.interior_corrections (
  pedido_id text PRIMARY KEY,
  numero_pedido text,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  qtd_volumes integer NOT NULL,
  valor_total numeric,
  historico jsonb NOT NULL DEFAULT '[]'::jsonb,
  corrigido_by uuid,
  corrigido_by_name text,
  corrigido_at timestamptz NOT NULL DEFAULT now(),
  enviado_omie_at timestamptz,
  erro_omie text
);

GRANT SELECT, INSERT, UPDATE ON public.interior_corrections TO authenticated;
GRANT ALL ON public.interior_corrections TO service_role;

ALTER TABLE public.interior_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stock 360 users can view interior corrections"
ON public.interior_corrections FOR SELECT TO authenticated
USING (public.has_company_access(auth.uid(), (SELECT id FROM public.companies WHERE slug = 'stock360')));

CREATE POLICY "Stock 360 checkers can create interior corrections"
ON public.interior_corrections FOR INSERT TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), (SELECT id FROM public.companies WHERE slug = 'stock360'))
  AND NOT (public.has_role(auth.uid(), 'comercial') AND NOT public.has_role(auth.uid(), 'admin'))
);

CREATE POLICY "Stock 360 checkers can update interior corrections"
ON public.interior_corrections FOR UPDATE TO authenticated
USING (
  public.has_company_access(auth.uid(), (SELECT id FROM public.companies WHERE slug = 'stock360'))
  AND NOT (public.has_role(auth.uid(), 'comercial') AND NOT public.has_role(auth.uid(), 'admin'))
)
WITH CHECK (
  public.has_company_access(auth.uid(), (SELECT id FROM public.companies WHERE slug = 'stock360'))
  AND NOT (public.has_role(auth.uid(), 'comercial') AND NOT public.has_role(auth.uid(), 'admin'))
);