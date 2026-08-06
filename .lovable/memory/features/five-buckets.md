---
name: Five-bucket monthly structure
description: The 5 planning buckets shared by Setup and Dashboard, their planned sources and reconciliation rules
type: feature
---
Setup and Dashboard share exactly five buckets, in this order:
1. Regular Expenses — planned = HDFC→CUB monthly transfer (not the sum of category limits). Categories are fully user-defined; never hardcode names.
2. SIP Investments — planned = sum of monthly amounts for ACTIVE SIPs only.
3. Fund Contributions — planned = Corpus + Trip monthly targets. SBI residual = rent − Car EMI − Tax Reserve (capped at combined target); HDFC→SBI top-up is computed, never entered.
4. Fixed Commitments — Car EMI (monthly) + Flat Maintenance (quarterly: Jan, Apr, Jul, Oct; ₹0 in other months; reconciliation bar prorates it as amount ÷ 3).
5. Tax Reserve — planned = monthly accrual.

Planned monthly income is always a user-editable input (budget_plan.planned_monthly_income) — never hardcode ₹145,000.
Category naming: "Car EMI" and "Flat Maintenance"/"Maintenance" belong to Fixed Commitments only. "Car Maintenance" is a Regular Expense category.
Internal transfers (HDFC→CUB, HDFC→SBI) never appear as waterfall rows.
Setup save aborts if a previously non-zero value would be overwritten with 0.