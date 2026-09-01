DROP POLICY IF EXISTS "Admin and expedicao can update expedition orders" ON public.expedition_orders;
CREATE POLICY "Admin expedicao motorista can update expedition orders"
ON public.expedition_orders FOR UPDATE TO authenticated
USING (has_company_access(auth.uid(), company_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'expedicao'::app_role) OR has_role(auth.uid(), 'motorista'::app_role)))
WITH CHECK (has_company_access(auth.uid(), company_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'expedicao'::app_role) OR has_role(auth.uid(), 'motorista'::app_role)));

DROP POLICY IF EXISTS "Admin and expedicao can update expedition items" ON public.expedition_order_items;
CREATE POLICY "Admin expedicao motorista can update expedition items"
ON public.expedition_order_items FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'expedicao'::app_role) OR has_role(auth.uid(), 'motorista'::app_role))
  AND EXISTS (SELECT 1 FROM public.expedition_orders o WHERE o.id = expedition_order_id AND has_company_access(auth.uid(), o.company_id))
);

CREATE POLICY "Motorista can insert routes"
ON public.routes FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'motorista'::app_role) AND has_company_access(auth.uid(), company_id));

CREATE POLICY "Motorista can insert route products"
ON public.route_products FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'motorista'::app_role)
  AND EXISTS (SELECT 1 FROM public.routes r WHERE r.id = route_id AND has_company_access(auth.uid(), r.company_id))
);