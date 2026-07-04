-- Add new transaction_type enum values (safe additive)
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'loan_given';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'loan_received';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'internal_loan_repayment';

-- Loan-specific enums
CREATE TYPE public.loan_type AS ENUM ('external','internal');
CREATE TYPE public.loan_status AS ENUM ('active','settled');

-- LOANS table
CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_type public.loan_type NOT NULL,
  name text NOT NULL,
  borrower_name text,
  disbursement_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  repayment_account_id uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  principal_amount numeric(14,2) NOT NULL,
  disbursement_date date NOT NULL,
  monthly_installment numeric(14,2),
  status public.loan_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own loans" ON public.loans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER loans_updated BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX loans_user_idx ON public.loans (user_id);

-- Extend transactions with loan_id link
ALTER TABLE public.transactions
  ADD COLUMN loan_id uuid REFERENCES public.loans(id) ON DELETE SET NULL;
CREATE INDEX tx_loan_idx ON public.transactions (loan_id);

-- Relax the shape checks so internal_loan_repayment can carry BOTH a
-- category_id (for budget tracking) AND a destination_account_id (for the
-- CUB -> SBI credit). Text-cast avoids "unsafe use of new enum value"
-- inside the same migration transaction.
ALTER TABLE public.transactions DROP CONSTRAINT tx_category_only_expense;
ALTER TABLE public.transactions DROP CONSTRAINT tx_destination_only_for_transfer;

ALTER TABLE public.transactions ADD CONSTRAINT tx_category_only_expense CHECK (
  (type::text IN ('expense','internal_loan_repayment') AND category_id IS NOT NULL) OR
  (type::text NOT IN ('expense','internal_loan_repayment') AND category_id IS NULL)
);
ALTER TABLE public.transactions ADD CONSTRAINT tx_destination_only_for_transfer CHECK (
  (type::text IN ('transfer','internal_loan_repayment')
     AND destination_account_id IS NOT NULL
     AND destination_account_id <> account_id)
  OR
  (type::text NOT IN ('transfer','internal_loan_repayment') AND destination_account_id IS NULL)
);