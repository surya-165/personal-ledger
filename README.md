# My Money Flow

I'm building a personal finance tracker app for myself (single

user, no multi-tenancy needed). Here's the full context for this

project — please treat this as foundational and keep it in mind for

all future work on this app, not just this first request.

PRODUCT VISION

Replaces a Google Sheet. Tracks three real bank accounts, a monthly

income waterfall, category budgets, two goal-based savings funds,

and mutual fund SIP investments.

ACCOUNTS

Three real accounts: HDFC (salary account — receives salary, pays

most fixed commitments and transfers), CUB (regular daily spending,

funded by a monthly transfer from HDFC), SBI (accumulation-only —

receives rental income, never sends money out except two fixed

expenses and an annual tax payment).

RESERVES (off-limits portions of an account's balance)

- CUB Floor: a static ₹10,000 always excluded from "usable" balance.

- SBI Tax Reserve: accrues a fixed ₹4,200/month from rental income,

  drawn down once a year when tax is actually paid.

GOAL FUNDS

Corpus Fund and Trip Fund, both physically accumulating inside SBI —

contributions reduce SBI's usable/free balance, same as a reserve.

Monthly targets: Corpus ₹25,000, Trip ₹12,000. Each has its own

ledger of contributions and withdrawals with a running balance.

Withdrawals get a free-text description only (no category) and are

excluded from monthly income reporting.

CATEGORIES & BUDGETS

Spending categories (Groceries, Food & Eating Out, Commute,

Utilities, Subscriptions, Shopping, Travel, etc.) each with a

monthly spend limit.

INVESTMENTS

Mutual fund SIPs tagged to long-term goals (House, Retirement,

Child Education, Vacation), with a monthly SIP amount and running

invested total, sourced from HDFC.

TRANSACTION TYPES (every money movement is exactly one of these)

income | expense | transfer | fund_contribution | fund_withdrawal |

reserve_accrual

MONTHLY INCOME WATERFALL

Total usable income ~₹145,000/month (salary + net rent), flowing

into internal transfers (net zero), expenses, reserve accruals, and

fund contributions, ending in an unallocated remainder.

fund_withdrawal transactions are excluded from this view.

---

For THIS first step specifically: build only the front-end

structure, no backend or database yet, using placeholder/dummy data.

Pages/navigation:

- Dashboard (account balances, budget summary, fund progress,

  monthly waterfall placeholder)

- Transactions (log/list view with filters by date, category,

  account, type)

- Accounts (HDFC, CUB, SBI — each showing balance and a usable vs

  reserved breakdown)

- Funds (Corpus Fund, Trip Fund — ledger view, progress toward

  monthly target)

- Budgets (category list with spent vs limit)

- Investments (SIP list with invested amount vs monthly commitment)

Use a clean, minimal financial-app aesthetic — clear typography,

generous whitespace, a calm color palette. Don't connect Supabase

yet, I'll do that in a later step.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kanakku-vazhakku.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e086f00f-a1ed-4c21-a4f3-fbad91948a27).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
