DO $$ BEGIN
  CREATE TYPE public.credit_card_payment_status AS ENUM ('unpaid','partial','paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_credit_card boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_card_paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_card_payment_status public.credit_card_payment_status;

CREATE TABLE IF NOT EXISTS public.credit_card_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  payment_amount numeric NOT NULL CHECK (payment_amount > 0),
  paid_from_account_id uuid NOT NULL REFERENCES public.accounts(id),
  payment_date date NOT NULL,
  payment_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_card_payments TO authenticated;
GRANT ALL ON public.credit_card_payments TO service_role;

ALTER TABLE public.credit_card_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own credit card payments" ON public.credit_card_payments;
CREATE POLICY "own credit card payments" ON public.credit_card_payments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ccp_transaction_idx ON public.credit_card_payments (transaction_id);

DROP TRIGGER IF EXISTS credit_card_payments_updated ON public.credit_card_payments;
CREATE TRIGGER credit_card_payments_updated BEFORE UPDATE ON public.credit_card_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_sync_credit_card_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[];
  tid uuid;
  total numeric;
BEGIN
  ids := ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[
    CASE WHEN TG_OP <> 'DELETE' THEN NEW.transaction_id END,
    CASE WHEN TG_OP <> 'INSERT' THEN OLD.transaction_id END
  ]) AS x WHERE x IS NOT NULL);

  FOREACH tid IN ARRAY ids LOOP
    SELECT COALESCE(SUM(payment_amount), 0) INTO total
      FROM public.credit_card_payments WHERE transaction_id = tid;
    UPDATE public.transactions t
      SET credit_card_paid_amount = total,
          credit_card_payment_status = (
            CASE
              WHEN total <= 0 THEN 'unpaid'
              WHEN total < t.amount THEN 'partial'
              ELSE 'paid'
            END
          )::public.credit_card_payment_status
      WHERE t.id = tid AND t.is_credit_card;
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS credit_card_payments_sync ON public.credit_card_payments;
CREATE TRIGGER credit_card_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.credit_card_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_credit_card_paid();