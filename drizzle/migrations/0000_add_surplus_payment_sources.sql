ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'surplus_payment';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS surplus_bucket text,
  ADD COLUMN IF NOT EXISTS source_fund_id uuid REFERENCES public.funds(id);

ALTER TABLE public.transactions
  ADD CONSTRAINT tx_surplus_payment_sources CHECK (
    (
      type::text = 'surplus_payment'
      AND ((surplus_bucket IS NOT NULL)::integer + (source_fund_id IS NOT NULL)::integer = 1)
      AND surplus_bucket IS NULL OR surplus_bucket IN (
        'Regular Expenses', 'SIP Investments', 'Fund Contributions', 'Fixed Commitments', 'Tax Reserve'
      )
    )
    OR (
      type::text <> 'surplus_payment'
      AND surplus_bucket IS NULL
      AND source_fund_id IS NULL
    )
  );