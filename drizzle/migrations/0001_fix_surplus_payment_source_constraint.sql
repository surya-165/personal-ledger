ALTER TABLE public.transactions DROP CONSTRAINT tx_surplus_payment_sources;

ALTER TABLE public.transactions
  ADD CONSTRAINT tx_surplus_payment_sources CHECK (
    (
      type::text = 'surplus_payment'
      AND ((surplus_bucket IS NOT NULL) <> (source_fund_id IS NOT NULL))
      AND (
        surplus_bucket IS NULL
        OR surplus_bucket IN (
          'Regular Expenses', 'SIP Investments', 'Fund Contributions', 'Fixed Commitments', 'Tax Reserve'
        )
      )
    )
    OR (
      type::text <> 'surplus_payment'
      AND surplus_bucket IS NULL
      AND source_fund_id IS NULL
    )
  );