CREATE POLICY "Expedicao can view profiles" ON public.profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'expedicao'));