-- 1. Companies
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  has_expedition boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

INSERT INTO public.companies (name, slug, has_expedition)
VALUES ('Stock 360', 'stock360', false), ('Uniprint Manaus', 'uniprint', true);

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. User <-> company membership
CREATE TABLE public.user_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
GRANT SELECT ON public.user_companies TO authenticated;
GRANT ALL ON public.user_companies TO service_role;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

INSERT INTO public.user_companies (user_id, company_id)
SELECT p.id, c.id FROM public.profiles p CROSS JOIN public.companies c WHERE c.slug = 'stock360';

CREATE OR REPLACE FUNCTION public.has_company_access(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_companies
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;

CREATE POLICY "Users can view their companies" ON public.companies
FOR SELECT TO authenticated
USING (public.has_company_access(auth.uid(), id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage companies" ON public.companies
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own memberships" ON public.user_companies
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage memberships" ON public.user_companies
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. company_id on existing tables (default = Stock 360 so current code keeps working)
DO $$
DECLARE _stock uuid;
BEGIN
  SELECT id INTO _stock FROM public.companies WHERE slug = 'stock360';
  EXECUTE format('ALTER TABLE public.routes ADD COLUMN company_id uuid NOT NULL DEFAULT %L REFERENCES public.companies(id)', _stock);
  EXECUTE format('ALTER TABLE public.drivers ADD COLUMN company_id uuid NOT NULL DEFAULT %L REFERENCES public.companies(id)', _stock);
  EXECUTE format('ALTER TABLE public.vehicles ADD COLUMN company_id uuid NOT NULL DEFAULT %L REFERENCES public.companies(id)', _stock);
  EXECUTE format('ALTER TABLE public.consultants ADD COLUMN company_id uuid NOT NULL DEFAULT %L REFERENCES public.companies(id)', _stock);
  EXECUTE format('ALTER TABLE public.payment_methods ADD COLUMN company_id uuid NOT NULL DEFAULT %L REFERENCES public.companies(id)', _stock);
END $$;

CREATE INDEX idx_routes_company ON public.routes(company_id);
CREATE INDEX idx_drivers_company ON public.drivers(company_id);
CREATE INDEX idx_vehicles_company ON public.vehicles(company_id);

CREATE POLICY "Company members only can view routes" ON public.routes
AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.has_company_access(auth.uid(), company_id));

-- 4. Expedition orders
CREATE TABLE public.expedition_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'NFE',
  doc_number text,
  order_number text,
  client text NOT NULL,
  client_document text,
  neighborhood text,
  address text,
  cep text,
  seller text,
  total_value numeric,
  issued_at timestamptz,
  status text NOT NULL DEFAULT 'AGUARDANDO',
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  checked_by uuid,
  checked_at timestamptz,
  observation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, doc_type, doc_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expedition_orders TO authenticated;
GRANT ALL ON public.expedition_orders TO service_role;
ALTER TABLE public.expedition_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.expedition_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_order_id uuid NOT NULL REFERENCES public.expedition_orders(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  quantity numeric NOT NULL DEFAULT 1,
  unit text DEFAULT 'UN',
  unit_value numeric,
  total_value numeric,
  checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expedition_order_items TO authenticated;
GRANT ALL ON public.expedition_order_items TO service_role;
ALTER TABLE public.expedition_order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_expedition_orders_company_status ON public.expedition_orders(company_id, status);
CREATE INDEX idx_expedition_items_order ON public.expedition_order_items(expedition_order_id);

CREATE TRIGGER update_expedition_orders_updated_at BEFORE UPDATE ON public.expedition_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE POLICY "Company members can view expedition orders" ON public.expedition_orders
FOR SELECT TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'expedicao')
    OR public.has_role(auth.uid(), 'comercial')
    OR public.has_role(auth.uid(), 'motorista')
  )
);

CREATE POLICY "Admin and expedicao can insert expedition orders" ON public.expedition_orders
FOR INSERT TO authenticated
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'expedicao'))
);

CREATE POLICY "Admin and expedicao can update expedition orders" ON public.expedition_orders
FOR UPDATE TO authenticated
USING (
  public.has_company_access(auth.uid(), company_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'expedicao'))
)
WITH CHECK (
  public.has_company_access(auth.uid(), company_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'expedicao'))
);

CREATE POLICY "Admins can delete expedition orders" ON public.expedition_orders
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authorized users can view expedition items" ON public.expedition_order_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.expedition_orders o
  WHERE o.id = expedition_order_id AND public.has_company_access(auth.uid(), o.company_id)
));

CREATE POLICY "Admin and expedicao can insert expedition items" ON public.expedition_order_items
FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'expedicao'))
  AND EXISTS (
    SELECT 1 FROM public.expedition_orders o
    WHERE o.id = expedition_order_id AND public.has_company_access(auth.uid(), o.company_id)
  )
);

CREATE POLICY "Admin and expedicao can update expedition items" ON public.expedition_order_items
FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'expedicao'))
  AND EXISTS (
    SELECT 1 FROM public.expedition_orders o
    WHERE o.id = expedition_order_id AND public.has_company_access(auth.uid(), o.company_id)
  )
);

CREATE POLICY "Admins can delete expedition items" ON public.expedition_order_items
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. Realtime for the TV panel
ALTER TABLE public.expedition_orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expedition_orders;