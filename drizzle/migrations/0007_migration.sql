ALTER TABLE public.vehicles
  ADD COLUMN plate_normalized text GENERATED ALWAYS AS (translate(upper(regexp_replace(plate, '[^A-Za-z0-9]', '', 'g')), 'OI', '01')) STORED,
  ADD COLUMN smartgps_tracked boolean NOT NULL DEFAULT false,
  ADD COLUMN smartgps_device_id text;
CREATE INDEX idx_vehicles_plate_normalized ON public.vehicles (plate_normalized);
UPDATE public.vehicles SET smartgps_tracked = true
WHERE plate_normalized IN ('QZF3A06','TAF6F27','QZP2A45','QZF2J96','PHY3F93','UTP5E07','QZ06D40','QZY1133','QZ06B00','TSD6159');