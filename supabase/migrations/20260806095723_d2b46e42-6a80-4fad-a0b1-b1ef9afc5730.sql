ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS kite_symbol text;
ALTER TABLE public.budget_plan ADD COLUMN IF NOT EXISTS annual_tax_estimate numeric NOT NULL DEFAULT 0;