-- Update RLS policies for comercial role

-- Routes: comercial can only view (like regular users)
DROP POLICY IF EXISTS "Users can view routes" ON public.routes;
CREATE POLICY "Users can view routes" ON public.routes
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'motorista'::app_role) OR 
  has_role(auth.uid(), 'comercial'::app_role) OR 
  has_role(auth.uid(), 'user'::app_role)
);

-- Route occurrences: comercial can manage (like motorista and admin)
DROP POLICY IF EXISTS "Admins and motoristas can insert occurrences" ON public.route_occurrences;
CREATE POLICY "Admins, motoristas and comercial can insert occurrences" ON public.route_occurrences
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'motorista'::app_role) OR 
  has_role(auth.uid(), 'comercial'::app_role)
);

DROP POLICY IF EXISTS "Admins and motoristas can update occurrences" ON public.route_occurrences;
CREATE POLICY "Admins, motoristas and comercial can update occurrences" ON public.route_occurrences
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'motorista'::app_role) OR 
  has_role(auth.uid(), 'comercial'::app_role)
);

DROP POLICY IF EXISTS "Admins and motoristas can delete occurrences" ON public.route_occurrences;
CREATE POLICY "Admins, motoristas and comercial can delete occurrences" ON public.route_occurrences
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'motorista'::app_role) OR 
  has_role(auth.uid(), 'comercial'::app_role)
);

DROP POLICY IF EXISTS "Users can view occurrences" ON public.route_occurrences;
CREATE POLICY "Users can view occurrences" ON public.route_occurrences
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'motorista'::app_role) OR 
  has_role(auth.uid(), 'comercial'::app_role) OR 
  has_role(auth.uid(), 'user'::app_role)
);

-- Route occurrence photos: comercial can manage (like motorista and admin)
DROP POLICY IF EXISTS "Admins and motoristas can insert occurrence photos" ON public.route_occurrence_photos;
CREATE POLICY "Admins, motoristas and comercial can insert occurrence photos" ON public.route_occurrence_photos
FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'motorista'::app_role) OR 
  has_role(auth.uid(), 'comercial'::app_role)
);

DROP POLICY IF EXISTS "Admins and motoristas can delete occurrence photos" ON public.route_occurrence_photos;
CREATE POLICY "Admins, motoristas and comercial can delete occurrence photos" ON public.route_occurrence_photos
FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'motorista'::app_role) OR 
  has_role(auth.uid(), 'comercial'::app_role)
);

DROP POLICY IF EXISTS "Users can view occurrence photos" ON public.route_occurrence_photos;
CREATE POLICY "Users can view occurrence photos" ON public.route_occurrence_photos
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'motorista'::app_role) OR 
  has_role(auth.uid(), 'comercial'::app_role) OR 
  has_role(auth.uid(), 'user'::app_role)
);