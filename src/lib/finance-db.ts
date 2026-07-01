import { supabase } from "@/integrations/supabase/client";

export type TxType =
  | "income"
  | "expense"
  | "transfer"
  | "fund_contribution"
  | "fund_withdrawal"
  | "reserve_accrual";

export interface AccountRow {
  id: string;
  code: string;
  name: string;
  role: string | null;
  opening_balance: number;
}
export interface CategoryRow { id: string; name: string; monthly_limit: number }
export interface FundRow { id: string; code: string; name: string; account_id: string; monthly_target: number; opening_balance: number }
export interface ReserveRow { id: string; name: string; account_id: string; kind: "floor" | "accrual"; amount: number; monthly_accrual: number | null }
export interface TxRow {
  id: string;
  date: string;
  type: TxType;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  fund_id: string | null;
  reserve_id: string | null;
  description: string;
  amount: number;
  payment_mode: string | null;
}

export async function fetchAll(userId: string) {
  const [accounts, categories, funds, reserves, transactions] = await Promise.all([
    supabase.from("accounts").select("id,code,name,role,opening_balance").order("code"),
    supabase.from("categories").select("id,name,monthly_limit").order("sort_order"),
    supabase.from("funds").select("id,code,name,account_id,monthly_target,opening_balance").order("code"),
    supabase.from("reserves").select("id,name,account_id,kind,amount,monthly_accrual").order("name"),
    supabase.from("transactions").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  const err = accounts.error ?? categories.error ?? funds.error ?? reserves.error ?? transactions.error;
  if (err) throw err;
  return {
    accounts: (accounts.data ?? []) as AccountRow[],
    categories: (categories.data ?? []) as CategoryRow[],
    funds: (funds.data ?? []) as FundRow[],
    reserves: (reserves.data ?? []) as ReserveRow[],
    transactions: (transactions.data ?? []) as TxRow[],
  };
  // userId is unused here because RLS scopes rows; kept for future composition.
  void userId;
}

/** Seed the user's canonical setup if their accounts table is empty. */
export async function seedIfEmpty(userId: string) {
  const { count, error } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const today = new Date().toISOString().slice(0, 10);
  const { data: acc, error: aErr } = await supabase
    .from("accounts")
    .insert([
      { user_id: userId, code: "HDFC", name: "HDFC", role: "Salary · pays commitments & transfers", opening_balance: 0, opening_date: today },
      { user_id: userId, code: "CUB",  name: "CUB",  role: "Daily spending",                          opening_balance: 0, opening_date: today },
      { user_id: userId, code: "SBI",  name: "SBI",  role: "Accumulation · rental + goal funds",       opening_balance: 0, opening_date: today },
    ])
    .select("id,code");
  if (aErr) throw aErr;
  const byCode = Object.fromEntries((acc ?? []).map((a) => [a.code, a.id])) as Record<string, string>;

  await supabase.from("reserves").insert([
    { user_id: userId, account_id: byCode.CUB, name: "CUB Floor",   kind: "floor",   amount: 0, monthly_accrual: null },
    { user_id: userId, account_id: byCode.SBI, name: "Tax Reserve", kind: "accrual", amount: 0, monthly_accrual: 0 },
  ]);

  await supabase.from("funds").insert([
    { user_id: userId, account_id: byCode.SBI, code: "corpus", name: "Corpus Fund", monthly_target: 0, opening_balance: 0 },
    { user_id: userId, account_id: byCode.SBI, code: "trip",   name: "Trip Fund",   monthly_target: 0, opening_balance: 0 },
  ]);
}

/** Compute current balance for each account: opening + signed net of transactions. */
export function computeAccountBalances(
  accounts: AccountRow[],
  transactions: TxRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of accounts) out[a.id] = Number(a.opening_balance);
  for (const t of transactions) {
    const amt = Number(t.amount);
    switch (t.type) {
      case "income":
      case "fund_withdrawal":
        out[t.account_id] = (out[t.account_id] ?? 0) + amt;
        break;
      case "expense":
      case "fund_contribution":
        out[t.account_id] = (out[t.account_id] ?? 0) - amt;
        break;
      case "transfer":
        out[t.account_id] = (out[t.account_id] ?? 0) - amt;
        if (t.destination_account_id) {
          out[t.destination_account_id] = (out[t.destination_account_id] ?? 0) + amt;
        }
        break;
      case "reserve_accrual":
        // earmark within the account — does not change balance
        break;
    }
  }
  return out;
}

/** Fund running balance = opening + contributions − withdrawals. */
export function computeFundBalance(fund: FundRow, transactions: TxRow[]): number {
  let n = Number(fund.opening_balance);
  for (const t of transactions) {
    if (t.fund_id !== fund.id) continue;
    if (t.type === "fund_contribution") n += Number(t.amount);
    else if (t.type === "fund_withdrawal") n -= Number(t.amount);
  }
  return n;
}

/** Reserve running balance = base amount + accruals. */
export function computeReserveBalance(reserve: ReserveRow, transactions: TxRow[]): number {
  let n = Number(reserve.amount);
  for (const t of transactions) {
    if (t.reserve_id !== reserve.id) continue;
    if (t.type === "reserve_accrual") n += Number(t.amount);
  }
  return n;
}

export function formatINR(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  const s = abs.toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${sign}₹${grouped}`;
}

export const txTypeLabel: Record<TxType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  fund_contribution: "Fund contribution",
  fund_withdrawal: "Fund withdrawal",
  reserve_accrual: "Reserve accrual",
};