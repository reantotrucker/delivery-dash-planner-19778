CREATE TABLE public.expedition_infos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expedition_infos TO authenticated;
GRANT ALL ON public.expedition_infos TO service_role;

ALTER TABLE public.expedition_infos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view expedition infos"
ON public.expedition_infos FOR SELECT TO authenticated
USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Staff can insert expedition infos"
ON public.expedition_infos FOR INSERT TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id) AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'expedicao') OR
    public.has_role(auth.uid(), 'comercial')
  )
);

CREATE POLICY "Staff can update expedition infos"
ON public.expedition_infos FOR UPDATE TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id) AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'expedicao') OR
    public.has_role(auth.uid(), 'comercial')
  )
);

CREATE POLICY "Staff can delete expedition infos"
ON public.expedition_infos FOR DELETE TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id) AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'expedicao') OR
    public.has_role(auth.uid(), 'comercial')
  )
);

CREATE TRIGGER update_expedition_infos_updated_at
BEFORE UPDATE ON public.expedition_infos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.expedition_orders ADD COLUMN extra_info text;