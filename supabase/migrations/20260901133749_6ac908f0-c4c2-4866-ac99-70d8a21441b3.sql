CREATE POLICY "Expedicao can insert routes"
ON public.routes FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'expedicao'::app_role) AND has_company_access(auth.uid(), company_id));

CREATE POLICY "Expedicao can view routes"
ON public.routes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'expedicao'::app_role) AND has_company_access(auth.uid(), company_id));

CREATE POLICY "Expedicao can insert route products"
ON public.route_products FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'expedicao'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_id AND has_company_access(auth.uid(), r.company_id)
  )
);

CREATE POLICY "Expedicao can view route products"
ON public.route_products FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'expedicao'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_id AND has_company_access(auth.uid(), r.company_id)
  )
);