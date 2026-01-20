-- Add address and CEP columns to routes table
ALTER TABLE public.routes 
ADD COLUMN address TEXT,
ADD COLUMN cep TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.routes.address IS 'Endereço completo da rota';
COMMENT ON COLUMN public.routes.cep IS 'CEP do endereço';