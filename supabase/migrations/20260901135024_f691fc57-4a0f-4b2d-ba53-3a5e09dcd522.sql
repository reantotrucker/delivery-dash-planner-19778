CREATE TABLE public.route_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  signer_name text NOT NULL,
  signer_document text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_signatures_route ON public.route_signatures(route_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_signatures TO authenticated;
GRANT ALL ON public.route_signatures TO service_role;

ALTER TABLE public.route_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view signatures"
ON public.route_signatures FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'motorista'::app_role)
  OR has_role(auth.uid(), 'comercial'::app_role)
  OR has_role(auth.uid(), 'expedicao'::app_role)
);

CREATE POLICY "Operators can insert signatures"
ON public.route_signatures FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'motorista'::app_role)
  OR has_role(auth.uid(), 'expedicao'::app_role)
);

CREATE POLICY "Admin or creator can delete signatures"
ON public.route_signatures FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());

CREATE TRIGGER update_route_signatures_updated_at
BEFORE UPDATE ON public.route_signatures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE POLICY "Authorized users can view signature files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'route-signatures' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'motorista'::app_role)
    OR has_role(auth.uid(), 'comercial'::app_role)
    OR has_role(auth.uid(), 'expedicao'::app_role)
  )
);

CREATE POLICY "Operators can upload signature files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'route-signatures' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'motorista'::app_role)
    OR has_role(auth.uid(), 'expedicao'::app_role)
  )
);

CREATE POLICY "Admin can delete signature files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'route-signatures' AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'motorista'::app_role)
  )
);