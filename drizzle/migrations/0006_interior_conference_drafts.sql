CREATE TABLE public.interior_conference_drafts (
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 pedido_id text NOT NULL,
 base_version text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (company_id, user_id, pedido_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interior_conference_drafts TO authenticated;
GRANT ALL ON public.interior_conference_drafts TO service_role;
ALTER TABLE public.interior_conference_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own Stock interior drafts" ON public.interior_conference_drafts FOR ALL TO authenticated
USING (user_id = auth.uid() AND public.has_company_access(auth.uid(), company_id) AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.slug = 'stock360') AND (NOT public.has_role(auth.uid(), 'comercial') OR public.has_role(auth.uid(), 'admin')))
WITH CHECK (user_id = auth.uid() AND public.has_company_access(auth.uid(), company_id) AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.slug = 'stock360') AND (NOT public.has_role(auth.uid(), 'comercial') OR public.has_role(auth.uid(), 'admin')));