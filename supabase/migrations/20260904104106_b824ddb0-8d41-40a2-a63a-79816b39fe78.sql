CREATE TABLE public.month_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month date NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.month_closures TO authenticated;
GRANT ALL ON public.month_closures TO service_role;

ALTER TABLE public.month_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own month closures" ON public.month_closures
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER month_closures_updated BEFORE UPDATE ON public.month_closures
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.surplus_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  closure_id uuid NOT NULL REFERENCES public.month_closures(id) ON DELETE CASCADE,
  month date NOT NULL,
  bucket text NOT NULL,
  planned_amount numeric NOT NULL DEFAULT 0,
  actual_amount numeric NOT NULL DEFAULT 0,
  surplus_amount numeric NOT NULL DEFAULT 0,
  source_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  destination_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  destination_note text,
  transfer_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.surplus_entries TO authenticated;
GRANT ALL ON public.surplus_entries TO service_role;

ALTER TABLE public.surplus_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own surplus entries" ON public.surplus_entries
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER surplus_entries_updated BEFORE UPDATE ON public.surplus_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX surplus_entries_closure_idx ON public.surplus_entries(closure_id);