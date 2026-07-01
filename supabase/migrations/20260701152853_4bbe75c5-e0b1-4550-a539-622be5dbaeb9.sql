
CREATE TABLE public.budget_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  planned_monthly_income numeric not null default 0,
  planned_car_emi numeric not null default 0,
  planned_maintenance numeric not null default 0,
  planned_tax_reserve numeric not null default 0,
  planned_corpus_contribution numeric not null default 0,
  planned_trip_contribution numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_plan TO authenticated;
GRANT ALL ON public.budget_plan TO service_role;

ALTER TABLE public.budget_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own budget plan"
  ON public.budget_plan FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_budget_plan_updated_at
  BEFORE UPDATE ON public.budget_plan
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
