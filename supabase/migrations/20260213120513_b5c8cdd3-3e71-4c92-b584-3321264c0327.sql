
-- Table to store products per route (populated during Omie import)
CREATE TABLE public.route_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'UN',
  unit_value NUMERIC,
  total_value NUMERIC,
  checked BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMP WITH TIME ZONE,
  checked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.route_products ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view route products
CREATE POLICY "Authenticated users can view route products"
ON public.route_products FOR SELECT
TO authenticated
USING (true);

-- All authenticated users can insert route products
CREATE POLICY "Authenticated users can insert route products"
ON public.route_products FOR INSERT
TO authenticated
WITH CHECK (true);

-- All authenticated users can update route products (for checking)
CREATE POLICY "Authenticated users can update route products"
ON public.route_products FOR UPDATE
TO authenticated
USING (true);

-- All authenticated users can delete route products
CREATE POLICY "Authenticated users can delete route products"
ON public.route_products FOR DELETE
TO authenticated
USING (true);

-- Index for fast lookups by route
CREATE INDEX idx_route_products_route_id ON public.route_products(route_id);
