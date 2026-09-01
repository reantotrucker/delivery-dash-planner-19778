DROP POLICY IF EXISTS "Admin expedicao motorista can update expedition orders" ON public.expedition_orders;

CREATE POLICY "Company staff can update expedition orders"
ON public.expedition_orders
FOR UPDATE
TO authenticated
USING (
  has_company_access(auth.uid(), company_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'expedicao'::app_role) OR
    has_role(auth.uid(), 'motorista'::app_role) OR
    has_role(auth.uid(), 'comercial'::app_role)
  )
)
WITH CHECK (
  has_company_access(auth.uid(), company_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'expedicao'::app_role) OR
    has_role(auth.uid(), 'motorista'::app_role) OR
    has_role(auth.uid(), 'comercial'::app_role)
  )
);