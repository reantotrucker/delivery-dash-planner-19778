
-- Migration: 20251030162219
-- Create enum types
CREATE TYPE period_type AS ENUM ('MANHA', 'TARDE');
CREATE TYPE status_type AS ENUM ('ENTREGUE', 'NAO_ENTREGUE');

-- Drivers table
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vehicles table
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Consultants table
CREATE TABLE consultants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payment methods table
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Routes table
CREATE TABLE routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  period period_type NOT NULL,
  client TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  consultant_id UUID REFERENCES consultants(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  observation TEXT,
  status status_type DEFAULT 'NAO_ENTREGUE',
  order_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

-- Public access policies (no auth required for this logistics system)
CREATE POLICY "Allow all on drivers" ON drivers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on vehicles" ON vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on consultants" ON consultants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on payment_methods" ON payment_methods FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on routes" ON routes FOR ALL USING (true) WITH CHECK (true);

-- Insert initial drivers with colors
INSERT INTO drivers (name, color) VALUES
  ('LUCIANO', '#FF6B00'),
  ('LABORDA', '#00C2FF'),
  ('ROBERT', '#FFD700'),
  ('DIOGO', '#00FF85'),
  ('GIOVANI', '#FF00FF'),
  ('OUTRO', '#999999');

-- Insert initial vehicles
INSERT INTO vehicles (plate) VALUES
  ('QZF-3A06'),
  ('QZP-2A45'),
  ('QZY-1I33'),
  ('TAF-6F27'),
  ('QZF-2J96'),
  ('QZ06B00'),
  ('QZO6D40');

-- Insert initial consultants
INSERT INTO consultants (name) VALUES
  ('ELIZANGELA'),
  ('AMANDA'),
  ('FABIOLA'),
  ('ELIANE'),
  ('MARCIA'),
  ('SUZY'),
  ('AMAZONAS'),
  ('ALINE'),
  ('RENATO');

-- Insert initial payment methods
INSERT INTO payment_methods (name) VALUES
  ('PIX'),
  ('CARTAO CREDITO'),
  ('BOLETO'),
  ('TROCA'),
  ('REMESSA');

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_consultants_updated_at BEFORE UPDATE ON consultants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON routes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Migration: 20251103123012
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  
  -- Assign role: admin for specific email, user for others
  IF NEW.email = 'renato@stock360.com.br' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger for profiles updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Migration: 20251103123045
-- Fix search_path for update_updated_at function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Migration: 20251104115012
-- Tabela para registrar ocorrências das rotas
CREATE TABLE public.route_occurrences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  motorista BOOLEAN NOT NULL DEFAULT false,
  vendedor BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.route_occurrences ENABLE ROW LEVEL SECURITY;

-- Políticas RLS temporárias (permitir tudo para usuários autenticados)
CREATE POLICY "Allow all on route_occurrences" 
ON public.route_occurrences 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_route_occurrences_updated_at
BEFORE UPDATE ON public.route_occurrences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Índice para melhorar performance nas consultas por route_id
CREATE INDEX idx_route_occurrences_route_id ON public.route_occurrences(route_id);

-- Migration: 20251105114200
-- Create storage bucket for route occurrence photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('route-occurrences', 'route-occurrences', true);

-- Create table to store photo metadata
CREATE TABLE public.route_occurrence_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurrence_id UUID NOT NULL REFERENCES public.route_occurrences(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.route_occurrence_photos ENABLE ROW LEVEL SECURITY;

-- RLS policies for route_occurrence_photos table
CREATE POLICY "Allow all on route_occurrence_photos" 
ON public.route_occurrence_photos 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Storage policies for route-occurrences bucket
CREATE POLICY "Photos are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'route-occurrences');

CREATE POLICY "Users can upload photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'route-occurrences' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete photos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'route-occurrences' AND auth.uid() IS NOT NULL);

-- Create index for better query performance
CREATE INDEX idx_route_occurrence_photos_occurrence_id ON public.route_occurrence_photos(occurrence_id);

-- Migration: 20251105184214
-- Fix storage bucket security: require authentication for photo access

-- Drop the public policy
DROP POLICY IF EXISTS "Photos are publicly accessible" ON storage.objects;

-- Create authenticated-only policy for viewing photos
CREATE POLICY "Authenticated users can view photos" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'route-occurrences' 
  AND auth.role() = 'authenticated'
);

-- Create policy for authenticated users to upload photos
CREATE POLICY "Authenticated users can upload photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'route-occurrences' 
  AND auth.role() = 'authenticated'
);

-- Create policy for authenticated users to delete photos
CREATE POLICY "Authenticated users can delete photos" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'route-occurrences' 
  AND auth.role() = 'authenticated'
);
