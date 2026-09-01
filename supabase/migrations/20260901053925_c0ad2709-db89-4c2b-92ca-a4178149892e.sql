ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS tx_category_only_expense;

ALTER TABLE public.transactions ADD CONSTRAINT tx_category_valid_types
  CHECK (
    (type)::text = ANY (
      ARRAY[
        'expense'::text,
        'fund_contribution'::text,
        'reserve_accrual'::text,
        'internal_loan_repayment'::text
      ]
    )
    OR
    (
      (type)::text <> ALL (
        ARRAY[
          'expense'::text,
          'fund_contribution'::text,
          'reserve_accrual'::text,
          'internal_loan_repayment'::text
        ]
      )
      AND category_id IS NULL
    )
  );