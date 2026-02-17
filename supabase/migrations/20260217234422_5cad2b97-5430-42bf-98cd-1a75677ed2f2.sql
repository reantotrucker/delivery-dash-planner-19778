
-- Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all on drivers" ON public.drivers;
DROP POLICY IF EXISTS "Allow all on vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow all on consultants" ON public.consultants;
DROP POLICY IF EXISTS "Allow all on payment_methods" ON public.payment_methods;

-- DRIVERS: authenticated read, admin write
CREATE POLICY "Authenticated users can view drivers"
ON public.drivers FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert drivers"
ON public.drivers FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update drivers"
ON public.drivers FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete drivers"
ON public.drivers FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- VEHICLES: authenticated read, admin write
CREATE POLICY "Authenticated users can view vehicles"
ON public.vehicles FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert vehicles"
ON public.vehicles FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update vehicles"
ON public.vehicles FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete vehicles"
ON public.vehicles FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- CONSULTANTS: authenticated read, admin write
CREATE POLICY "Authenticated users can view consultants"
ON public.consultants FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert consultants"
ON public.consultants FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update consultants"
ON public.consultants FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete consultants"
ON public.consultants FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- PAYMENT_METHODS: authenticated read, admin write
CREATE POLICY "Authenticated users can view payment_methods"
ON public.payment_methods FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert payment_methods"
ON public.payment_methods FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update payment_methods"
ON public.payment_methods FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete payment_methods"
ON public.payment_methods FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
