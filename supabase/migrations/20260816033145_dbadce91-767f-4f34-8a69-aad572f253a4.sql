ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS sub_category text;

UPDATE public.transactions t SET sub_category = c.name
  FROM public.categories c
 WHERE t.category_id = c.id AND t.sub_category IS NULL;

UPDATE public.transactions t SET sub_category = f.name
  FROM public.funds f
 WHERE t.fund_id = f.id AND t.sub_category IS NULL AND t.type = 'fund_contribution';

UPDATE public.transactions SET sub_category = 'Tax Reserve'
 WHERE type = 'reserve_accrual' AND sub_category IS NULL;