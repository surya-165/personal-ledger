CREATE TYPE public.goal_mapping_type AS ENUM ('mf_holding','equity');

CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  time_frame_months integer NOT NULL DEFAULT 0,
  target_amount numeric NOT NULL DEFAULT 0,
  expected_return_percent numeric NOT NULL DEFAULT 12,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON public.goals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER goals_updated BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.goal_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  mapping_type public.goal_mapping_type NOT NULL,
  kite_tradingsymbol text,
  equity_allocation_percent numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goal_mappings_shape CHECK (
    (mapping_type = 'mf_holding' AND kite_tradingsymbol IS NOT NULL AND equity_allocation_percent IS NULL)
    OR (mapping_type = 'equity' AND equity_allocation_percent IS NOT NULL AND kite_tradingsymbol IS NULL)
  )
);
CREATE UNIQUE INDEX goal_mappings_mf_unique ON public.goal_mappings (user_id, kite_tradingsymbol) WHERE mapping_type = 'mf_holding';
CREATE UNIQUE INDEX goal_mappings_equity_unique ON public.goal_mappings (user_id, goal_id) WHERE mapping_type = 'equity';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_mappings TO authenticated;
GRANT ALL ON public.goal_mappings TO service_role;
ALTER TABLE public.goal_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goal mappings" ON public.goal_mappings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER goal_mappings_updated BEFORE UPDATE ON public.goal_mappings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.kite_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  public_token text,
  kite_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kite_tokens TO authenticated;
GRANT ALL ON public.kite_tokens TO service_role;
ALTER TABLE public.kite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own kite token" ON public.kite_tokens FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER kite_tokens_updated BEFORE UPDATE ON public.kite_tokens FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();