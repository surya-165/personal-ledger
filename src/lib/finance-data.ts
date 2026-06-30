// Placeholder/dummy data for the personal finance tracker.
// All amounts in INR. Replace with Lovable Cloud-backed data later.

export type AccountId = "HDFC" | "CUB" | "SBI";

export type TransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "fund_contribution"
  | "fund_withdrawal"
  | "reserve_accrual";

export interface Account {
  id: AccountId;
  name: string;
  role: string;
  balance: number;
  reserved: number; // floor + fund holdings + tax reserve
  reservedBreakdown: { label: string; amount: number }[];
}

export interface Category {
  name: string;
  limit: number;
  spent: number;
}

export interface Fund {
  id: "corpus" | "trip";
  name: string;
  monthlyTarget: number;
  balance: number;
  contributedThisMonth: number;
  ledger: {
    date: string;
    kind: "contribution" | "withdrawal";
    amount: number;
    description: string;
    running: number;
  }[];
}

export interface SIP {
  name: string;
  goal: "House" | "Retirement" | "Child Education" | "Vacation";
  monthly: number;
  invested: number;
}

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  account: AccountId;
  counterAccount?: AccountId;
  category?: string;
  description: string;
  amount: number; // positive = inflow to `account`, negative = outflow
}

export const accounts: Account[] = [
  {
    id: "HDFC",
    name: "HDFC",
    role: "Salary · pays commitments & transfers",
    balance: 82340,
    reserved: 0,
    reservedBreakdown: [],
  },
  {
    id: "CUB",
    name: "CUB",
    role: "Daily spending",
    balance: 21450,
    reserved: 10000,
    reservedBreakdown: [{ label: "CUB Floor", amount: 10000 }],
  },
  {
    id: "SBI",
    name: "SBI",
    role: "Accumulation · rental + goal funds",
    balance: 412800,
    reserved: 25200 + 168000 + 54000,
    reservedBreakdown: [
      { label: "Tax Reserve", amount: 25200 },
      { label: "Corpus Fund", amount: 168000 },
      { label: "Trip Fund", amount: 54000 },
    ],
  },
];

export const categories: Category[] = [
  { name: "Groceries", limit: 12000, spent: 7820 },
  { name: "Food & Eating Out", limit: 8000, spent: 6240 },
  { name: "Commute", limit: 4500, spent: 3100 },
  { name: "Utilities", limit: 5500, spent: 5180 },
  { name: "Subscriptions", limit: 2500, spent: 2350 },
  { name: "Shopping", limit: 6000, spent: 2100 },
  { name: "Travel", limit: 5000, spent: 900 },
];

export const funds: Fund[] = [
  {
    id: "corpus",
    name: "Corpus Fund",
    monthlyTarget: 25000,
    balance: 168000,
    contributedThisMonth: 15000,
    ledger: [
      { date: "2026-06-05", kind: "contribution", amount: 15000, description: "June contribution", running: 168000 },
      { date: "2026-05-04", kind: "contribution", amount: 25000, description: "May contribution", running: 153000 },
      { date: "2026-04-12", kind: "withdrawal", amount: 8000, description: "Laptop repair", running: 128000 },
      { date: "2026-04-03", kind: "contribution", amount: 25000, description: "April contribution", running: 136000 },
    ],
  },
  {
    id: "trip",
    name: "Trip Fund",
    monthlyTarget: 12000,
    balance: 54000,
    contributedThisMonth: 12000,
    ledger: [
      { date: "2026-06-05", kind: "contribution", amount: 12000, description: "June contribution", running: 54000 },
      { date: "2026-05-04", kind: "contribution", amount: 12000, description: "May contribution", running: 42000 },
      { date: "2026-04-03", kind: "contribution", amount: 12000, description: "April contribution", running: 30000 },
      { date: "2026-03-15", kind: "withdrawal", amount: 6000, description: "Weekend in Coorg", running: 18000 },
    ],
  },
];

export const sips: SIP[] = [
  { name: "Parag Parikh Flexi Cap", goal: "Retirement", monthly: 10000, invested: 420000 },
  { name: "Axis Small Cap", goal: "House", monthly: 8000, invested: 264000 },
  { name: "Mirae Asset Large Cap", goal: "Child Education", monthly: 5000, invested: 145000 },
  { name: "HDFC Index Fund", goal: "Retirement", monthly: 6000, invested: 198000 },
  { name: "ICICI Bluechip", goal: "Vacation", monthly: 3000, invested: 54000 },
];

export const transactions: Transaction[] = [
  { id: "t1", date: "2026-06-28", type: "expense", account: "CUB", category: "Groceries", description: "BigBasket weekly", amount: -2140 },
  { id: "t2", date: "2026-06-27", type: "expense", account: "CUB", category: "Food & Eating Out", description: "Dinner — Toit", amount: -1850 },
  { id: "t3", date: "2026-06-26", type: "expense", account: "HDFC", category: "Subscriptions", description: "iCloud + Spotify", amount: -350 },
  { id: "t4", date: "2026-06-25", type: "transfer", account: "HDFC", counterAccount: "CUB", description: "Monthly spending transfer", amount: -25000 },
  { id: "t5", date: "2026-06-25", type: "transfer", account: "CUB", counterAccount: "HDFC", description: "Monthly spending transfer", amount: 25000 },
  { id: "t6", date: "2026-06-20", type: "fund_contribution", account: "SBI", description: "Corpus Fund — June", amount: -15000 },
  { id: "t7", date: "2026-06-20", type: "fund_contribution", account: "SBI", description: "Trip Fund — June", amount: -12000 },
  { id: "t8", date: "2026-06-15", type: "reserve_accrual", account: "SBI", description: "Tax reserve accrual", amount: -4200 },
  { id: "t9", date: "2026-06-10", type: "expense", account: "HDFC", category: "Utilities", description: "Electricity + Broadband", amount: -3180 },
  { id: "t10", date: "2026-06-05", type: "income", account: "SBI", description: "Rental income", amount: 28000 },
  { id: "t11", date: "2026-06-01", type: "income", account: "HDFC", description: "Salary", amount: 120000 },
  { id: "t12", date: "2026-05-22", type: "fund_withdrawal", account: "SBI", description: "Laptop repair (Corpus)", amount: 8000 },
  { id: "t13", date: "2026-05-18", type: "expense", account: "CUB", category: "Commute", description: "Petrol", amount: -1600 },
  { id: "t14", date: "2026-05-12", type: "expense", account: "CUB", category: "Shopping", description: "Linen shirt", amount: -2100 },
];

export const monthlyIncome = 120000 + 28000 - 3000; // salary + net rent (after maintenance, illustrative)

export function formatINR(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  // Indian grouping
  const s = abs.toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${sign}₹${grouped}`;
}

export const transactionTypeLabel: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  fund_contribution: "Fund contribution",
  fund_withdrawal: "Fund withdrawal",
  reserve_accrual: "Reserve accrual",
};