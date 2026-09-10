INSERT INTO public.companies (name, slug, has_expedition)
VALUES ('Uniprint Boa Vista', 'uniprint_bv', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.payment_methods (name, company_id)
SELECT pm.name, dst.id
FROM public.payment_methods pm
JOIN public.companies src ON src.id = pm.company_id AND src.slug = 'uniprint'
JOIN public.companies dst ON dst.slug = 'uniprint_bv'
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_methods p2
  WHERE p2.company_id = dst.id AND p2.name = pm.name
);