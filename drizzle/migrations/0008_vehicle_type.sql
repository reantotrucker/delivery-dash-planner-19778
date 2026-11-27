ALTER TABLE public.vehicles ADD COLUMN vehicle_type text NOT NULL DEFAULT 'carro';
UPDATE public.vehicles v SET vehicle_type = 'moto' FROM public.companies c
 WHERE c.id = v.company_id AND c.slug = 'stock360' AND v.plate_normalized IN ('QZF3A06','QZP2A45','QZF2J96','PHY3F93');
UPDATE public.vehicles v SET vehicle_type = 'carro' FROM public.companies c
 WHERE c.id = v.company_id AND c.slug = 'stock360' AND v.plate_normalized IN ('QZ06B00','QZY1133','QZ06D40','TAF6F27','TSD6159','UTP5E07');
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_type_check CHECK (vehicle_type IN ('carro','moto'));