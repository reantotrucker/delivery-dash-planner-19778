
-- Drop overly permissive policies
DROP POLICY "Authenticated users can insert route products" ON public.route_products;
DROP POLICY "Authenticated users can update route products" ON public.route_products;
DROP POLICY "Authenticated users can delete route products" ON public.route_products;
DROP POLICY "Authenticated users can view route products" ON public.route_products;

-- Role-based policies matching the pattern used in routes table
CREATE POLICY "Users can view route products"
ON public.route_products FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'motorista') OR has_role(auth.uid(), 'comercial') OR has_role(auth.uid(), 'user'));

CREATE POLICY "Admins can insert route products"
ON public.route_products FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins and motoristas can update route products"
ON public.route_products FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'motorista'));

CREATE POLICY "Admins can delete route products"
ON public.route_products FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));
