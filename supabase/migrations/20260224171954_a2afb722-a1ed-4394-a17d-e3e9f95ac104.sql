
-- Cache table for Omie API data (clients, orders, vendors)
CREATE TABLE public.omie_cache (
  cache_key TEXT PRIMARY KEY,
  cache_value JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for cleanup of expired entries
CREATE INDEX idx_omie_cache_expires_at ON public.omie_cache (expires_at);

-- Enable RLS
ALTER TABLE public.omie_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write cache (it's shared data, not user-specific)
CREATE POLICY "Authenticated users can read cache"
  ON public.omie_cache FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert cache"
  ON public.omie_cache FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update cache"
  ON public.omie_cache FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION public.clean_omie_cache()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  DELETE FROM public.omie_cache WHERE expires_at < now();
$$;
