-- Add cliente field to route_occurrences table
ALTER TABLE public.route_occurrences 
ADD COLUMN cliente boolean NOT NULL DEFAULT false;