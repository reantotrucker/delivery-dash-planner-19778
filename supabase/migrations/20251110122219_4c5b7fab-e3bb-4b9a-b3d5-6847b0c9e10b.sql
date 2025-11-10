-- Update RLS policies for routes table to allow motoristas to update status
DROP POLICY IF EXISTS "Allow all on routes" ON public.routes;

-- Motoristas and admins can view all routes
CREATE POLICY "Users can view routes"
ON public.routes
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'motorista'::app_role) OR
  public.has_role(auth.uid(), 'user'::app_role)
);

-- Only admins can insert routes
CREATE POLICY "Admins can insert routes"
ON public.routes
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all fields, motoristas can only update status
CREATE POLICY "Admins can update routes"
ON public.routes
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Motoristas can update route status"
ON public.routes
FOR UPDATE
USING (public.has_role(auth.uid(), 'motorista'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'motorista'::app_role));

-- Only admins can delete routes
CREATE POLICY "Admins can delete routes"
ON public.routes
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Update RLS policies for route_occurrences
DROP POLICY IF EXISTS "Allow all on route_occurrences" ON public.route_occurrences;

CREATE POLICY "Users can view occurrences"
ON public.route_occurrences
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'motorista'::app_role) OR
  public.has_role(auth.uid(), 'user'::app_role)
);

CREATE POLICY "Admins and motoristas can insert occurrences"
ON public.route_occurrences
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'motorista'::app_role)
);

CREATE POLICY "Admins and motoristas can update occurrences"
ON public.route_occurrences
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'motorista'::app_role)
);

CREATE POLICY "Admins and motoristas can delete occurrences"
ON public.route_occurrences
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'motorista'::app_role)
);

-- Update RLS policies for route_occurrence_photos
DROP POLICY IF EXISTS "Allow all on route_occurrence_photos" ON public.route_occurrence_photos;

CREATE POLICY "Users can view occurrence photos"
ON public.route_occurrence_photos
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'motorista'::app_role) OR
  public.has_role(auth.uid(), 'user'::app_role)
);

CREATE POLICY "Admins and motoristas can insert occurrence photos"
ON public.route_occurrence_photos
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'motorista'::app_role)
);

CREATE POLICY "Admins and motoristas can delete occurrence photos"
ON public.route_occurrence_photos
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'motorista'::app_role)
);