-- The two-level category system now needs category_id on more than just
-- 'expense' rows (e.g. SIP Investment / Fund Contribution transactions carry
-- a fund-backed category). Replace the old expense-only shape check with one
-- that reflects the current set of category-bearing transaction types.
ALTER TABLE public.transactions DROP CONSTRAINT tx_category_only_expense;

ALTER TABLE public.transactions ADD CONSTRAINT tx_category_valid_types CHECK (
  (type::text IN ('expense','fund_contribution','reserve_accrual','internal_loan_repayment')
     AND category_id IS NOT NULL)
  OR
  (type::text NOT IN ('expense','fund_contribution','reserve_accrual','internal_loan_repayment')
     AND category_id IS NULL)
);

-- No CHECK constraint currently exists on transactions.bucket, so there is
-- nothing to relax there. Left as a no-op for the record.
