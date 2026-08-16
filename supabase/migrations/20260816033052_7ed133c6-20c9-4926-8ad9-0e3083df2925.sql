ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'Regular Expenses';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bucket text;

UPDATE public.categories SET bucket = 'Fixed Commitments'
 WHERE name IN ('Car EMI','Flat Maintenance','Maintenance');
UPDATE public.categories SET bucket = 'Fund Contributions'
 WHERE name IN ('Corpus Fund','Trip Fund');
UPDATE public.categories SET bucket = 'Tax Reserve'
 WHERE name = 'Tax Reserve';

INSERT INTO public.categories (user_id, name, monthly_limit, sort_order, bucket)
SELECT DISTINCT c.user_id, 'Flat Maintenance', 0, 98, 'Fixed Commitments'
FROM public.categories c
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories d
  WHERE d.user_id = c.user_id AND d.name IN ('Flat Maintenance','Maintenance')
);

UPDATE public.transactions t SET bucket = 'Fund Contributions' WHERE t.type = 'fund_contribution';
UPDATE public.transactions t SET bucket = 'Tax Reserve' WHERE t.type = 'reserve_accrual';
UPDATE public.transactions t SET bucket = c.bucket
  FROM public.categories c
 WHERE t.category_id = c.id AND t.type = 'expense';
UPDATE public.transactions SET bucket = 'Regular Expenses'
 WHERE type = 'expense' AND bucket IS NULL;