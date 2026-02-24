
-- Add second check columns to route_products
ALTER TABLE public.route_products
ADD COLUMN checked2 boolean NOT NULL DEFAULT false,
ADD COLUMN checked2_at timestamp with time zone,
ADD COLUMN checked2_by uuid;
