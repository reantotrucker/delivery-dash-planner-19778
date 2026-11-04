CREATE TABLE public.manual_label_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX manual_label_templates_company_idx ON public.manual_label_templates(company_id, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_label_templates TO authenticated;
GRANT ALL ON public.manual_label_templates TO service_role;

ALTER TABLE public.manual_label_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company users can view label templates"
ON public.manual_label_templates FOR SELECT TO authenticated
USING (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Company users can create label templates"
ON public.manual_label_templates FOR INSERT TO authenticated
WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Company users can update label templates"
ON public.manual_label_templates FOR UPDATE TO authenticated
USING (public.has_company_access(auth.uid(), company_id))
WITH CHECK (public.has_company_access(auth.uid(), company_id));

CREATE POLICY "Company users can delete label templates"
ON public.manual_label_templates FOR DELETE TO authenticated
USING (public.has_company_access(auth.uid(), company_id));

CREATE TRIGGER manual_label_templates_updated_at
BEFORE UPDATE ON public.manual_label_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();