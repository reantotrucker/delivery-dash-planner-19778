DROP POLICY IF EXISTS "Admin and motorista can delete receipts" ON public.route_receipts;
CREATE POLICY "Admin or uploader can delete receipts"
ON public.route_receipts
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR uploaded_by = auth.uid());