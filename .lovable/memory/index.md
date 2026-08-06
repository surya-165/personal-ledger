# Project Memory

## Core
Single-user personal finance tracker (no multi-tenancy). All amounts in INR. Replaces a Google Sheet.
Three accounts: HDFC (salary, pays commitments/transfers), CUB (daily spend, funded by monthly transfer from HDFC), SBI (accumulation: rental income, fixed expenses, annual tax, holds goal funds).
Reserves reduce "usable" balance: CUB Floor static ₹10,000; SBI Tax Reserve accrues monthly, drawn down once a year.
Goal funds inside SBI: Corpus and Trip, each with its own ledger. Withdrawals are free-text only and excluded from monthly income reporting.
Transaction types — exactly one per movement: income | expense | transfer | fund_contribution | fund_withdrawal | reserve_accrual | loan_given | loan_received | internal_loan_repayment.
Setup and Dashboard must always mirror the same 5-bucket structure; all planned figures read from Setup, never hardcoded.
SIPs sourced from HDFC, tagged to long-term goals.
Design: clean minimal financial-app aesthetic — generous whitespace, tabular-nums for money, calm muted-teal palette on warm off-white. No purple. No dark mode toggle.

## Memories
- [Five-bucket structure](mem://features/five-buckets) — the 5 planning buckets, planned-amount sources, quarterly maintenance rule, reconciliation guards