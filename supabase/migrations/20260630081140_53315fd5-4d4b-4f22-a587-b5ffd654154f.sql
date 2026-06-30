
-- ENUMS
CREATE TYPE public.transaction_type AS ENUM (
  'income','expense','transfer','fund_contribution','fund_withdrawal','reserve_accrual'
);
CREATE TYPE public.reserve_kind AS ENUM ('floor','accrual');
CREATE TYPE public.split_component_type AS ENUM (
  'expense','reserve_accrual','fund_contribution','transfer'
);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ACCOUNTS
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  role text,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  opening_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.accounts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER accounts_updated BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RESERVES
CREATE TABLE public.reserves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind public.reserve_kind NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  monthly_accrual numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.reserves TO authenticated;
GRANT ALL ON public.reserves TO service_role;
ALTER TABLE public.reserves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reserves" ON public.reserves FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER reserves_updated BEFORE UPDATE ON public.reserves
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- FUNDS
CREATE TABLE public.funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  monthly_target numeric(14,2) NOT NULL DEFAULT 0,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.funds TO authenticated;
GRANT ALL ON public.funds TO service_role;
ALTER TABLE public.funds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own funds" ON public.funds FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER funds_updated BEFORE UPDATE ON public.funds
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- CATEGORIES
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  monthly_limit numeric(14,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.categories FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER categories_updated BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- INVESTMENTS (SIPs)
CREATE TABLE public.investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text NOT NULL,
  monthly_amount numeric(14,2) NOT NULL DEFAULT 0,
  invested_total numeric(14,2) NOT NULL DEFAULT 0,
  source_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.investments TO authenticated;
GRANT ALL ON public.investments TO service_role;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own investments" ON public.investments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER investments_updated BEFORE UPDATE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RECURRING TEMPLATES
CREATE TABLE public.recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.transaction_type NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  destination_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL,
  reserve_id uuid REFERENCES public.reserves(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL,
  day_of_month int CHECK (day_of_month BETWEEN 1 AND 31),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.recurring_templates TO authenticated;
GRANT ALL ON public.recurring_templates TO service_role;
ALTER TABLE public.recurring_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recurring" ON public.recurring_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER recurring_updated BEFORE UPDATE ON public.recurring_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- INCOME SPLIT RULES
CREATE TABLE public.income_split_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  trigger_type public.transaction_type NOT NULL DEFAULT 'income',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.income_split_rules TO authenticated;
GRANT ALL ON public.income_split_rules TO service_role;
ALTER TABLE public.income_split_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own split rules" ON public.income_split_rules FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER split_rules_updated BEFORE UPDATE ON public.income_split_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- INCOME SPLIT COMPONENTS
CREATE TABLE public.income_split_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.income_split_rules(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  component_type public.split_component_type NOT NULL,
  amount numeric(14,2),
  percent numeric(6,3),
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  destination_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL,
  reserve_id uuid REFERENCES public.reserves(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.income_split_components TO authenticated;
GRANT ALL ON public.income_split_components TO service_role;
ALTER TABLE public.income_split_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own split components" ON public.income_split_components FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER split_components_updated BEFORE UPDATE ON public.income_split_components
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- TRANSACTIONS (single source of truth)
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  type public.transaction_type NOT NULL,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  destination_account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  fund_id uuid REFERENCES public.funds(id) ON DELETE RESTRICT,
  reserve_id uuid REFERENCES public.reserves(id) ON DELETE RESTRICT,
  description text NOT NULL DEFAULT '',
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Type-specific shape rules
  CONSTRAINT tx_category_only_expense CHECK (
    (type = 'expense'  AND category_id IS NOT NULL) OR
    (type <> 'expense' AND category_id IS NULL)
  ),
  CONSTRAINT tx_fund_only_for_fund_moves CHECK (
    (type IN ('fund_contribution','fund_withdrawal') AND fund_id IS NOT NULL) OR
    (type NOT IN ('fund_contribution','fund_withdrawal') AND fund_id IS NULL)
  ),
  CONSTRAINT tx_reserve_only_for_accrual CHECK (
    (type = 'reserve_accrual' AND reserve_id IS NOT NULL) OR
    (type <> 'reserve_accrual' AND reserve_id IS NULL)
  ),
  CONSTRAINT tx_destination_only_for_transfer CHECK (
    (type = 'transfer' AND destination_account_id IS NOT NULL AND destination_account_id <> account_id) OR
    (type <> 'transfer' AND destination_account_id IS NULL)
  )
);
CREATE INDEX tx_user_date_idx ON public.transactions (user_id, date DESC);
CREATE INDEX tx_account_idx   ON public.transactions (account_id);
CREATE INDEX tx_fund_idx      ON public.transactions (fund_id);
CREATE INDEX tx_reserve_idx   ON public.transactions (reserve_id);
CREATE INDEX tx_category_idx  ON public.transactions (category_id);

GRANT SELECT,INSERT,UPDATE,DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transactions" ON public.transactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER transactions_updated BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
