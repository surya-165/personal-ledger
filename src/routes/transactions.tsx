import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LogOut, Calendar as CalendarIcon, X, Trash2, Pencil, ChevronDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAll,
  seedIfEmpty,
  formatINR,
  txTypeLabel,
  computeAccountBalances,
  ccOutstanding,
  BUCKETS,
  bucketTxType,
  nonSpendingTypes,
  type Bucket,
  type TxType,
  type AccountRow,
  type CategoryRow,
  type CreditCardPaymentRow,
  type FundRow,
  type InvestmentRow,
  type ReserveRow,
  type TxRow,
} from "@/lib/finance-db";
import {
  CreditCardPaymentDialog,
  deleteCreditCardTransaction,
} from "@/components/finance/credit-card-payment-dialog";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Ledger" },
      { name: "description", content: "Filterable log of every money movement." },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const dataQuery = useQuery({
    queryKey: ["finance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      await seedIfEmpty(user!.id);
      return fetchAll(user!.id);
    },
  });

  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(monthEndISO());
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [accountFilter, setAccountFilter] = useState<string[]>([]);
  const [bucketFilter, setBucketFilter] = useState<string[]>([]);
  const [subFilter, setSubFilter] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TxRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TxRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const data = dataQuery.data;
  const transactions = data?.transactions ?? [];
  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];
  const funds = data?.funds ?? [];
  const reserves = data?.reserves ?? [];
  const investments = data?.investments ?? [];
  const creditCardAccount = data?.creditCardAccount ?? null;
  const creditCardPayments = data?.creditCardPayments ?? [];

  // Cards shown as filters: the three banks plus the credit card.
  const filterCards = useMemo(
    () => (creditCardAccount ? [...accounts, creditCardAccount] : accounts),
    [accounts, creditCardAccount],
  );

  const ccTotalOutstanding = useMemo(
    () => transactions
      .filter((t) => t.is_credit_card && t.credit_card_payment_status !== "paid")
      .reduce((s, t) => s + ccOutstanding(t), 0),
    [transactions],
  );

  // Payments grouped by the card expense they belong to.
  const paymentsByTx = useMemo(() => {
    const m: Record<string, CreditCardPaymentRow[]> = {};
    for (const p of creditCardPayments) (m[p.transaction_id] ??= []).push(p);
    return m;
  }, [creditCardPayments]);

  const [payingTx, setPayingTx] = useState<TxRow | null>(null);

  // Account card filters default to all cards once data loads.
  useEffect(() => {
    if (filterCards.length > 0 && accountFilter.length === 0) {
      setAccountFilter(filterCards.map((a) => a.id));
    }
  }, [filterCards, accountFilter.length]);

  const toggleAccount = (id: string) => {
    setAccountFilter((prev) => {
      if (prev.includes(id)) {
        // Always keep at least one account selected.
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };


  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );
  const fundById = useMemo(() => Object.fromEntries(funds.map((f) => [f.id, f])), [funds]);

  const subLabel = useMemo(
    () => (t: TxRow) => {
      if (t.sub_category) return t.sub_category;
      if (t.category_id) return categoryById[t.category_id]?.name ?? "";
      if (t.type === "fund_contribution" && t.fund_id) return fundById[t.fund_id]?.name ?? "";
      if (t.type === "reserve_accrual") return "Tax Reserve";
      return "";
    },
    [categoryById, fundById],
  );

  // Level 2 options, grouped by their Level 1 bucket.
  const subsByBucket = useMemo(() => {
    const m: Record<string, string[]> = {
      "Regular Expenses": categories.filter((c) => c.bucket === "Regular Expenses").map((c) => c.name),
      "SIP Investments": investments.map((i) => i.name),
      "Fund Contributions": funds.map((f) => f.name),
      "Fixed Commitments": categories.filter((c) => c.bucket === "Fixed Commitments").map((c) => c.name),
      "Tax Reserve": ["Tax Reserve"],
    };
    return m;
  }, [categories, investments, funds]);

  const subOptions = useMemo(() => {
    const buckets = bucketFilter.length > 0 ? bucketFilter : (BUCKETS as readonly string[]);
    const names = new Set<string>();
    for (const b of buckets) for (const n of subsByBucket[b] ?? []) names.add(n);
    return [...names].map((n) => ({ value: n, label: n }));
  }, [bucketFilter, subsByBucket]);

  const balances = useMemo(
    () => computeAccountBalances(accounts, transactions),
    [accounts, transactions],
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(t.type)) return false;
      if (accountFilter.length > 0 && !accountFilter.includes(t.account_id)) return false;
      if (bucketFilter.length > 0 && (!t.bucket || !bucketFilter.includes(t.bucket))) return false;
      if (subFilter.length > 0 && !subFilter.includes(subLabel(t))) return false;
      return true;
    });
  }, [transactions, from, to, typeFilter, accountFilter, bucketFilter, subFilter, subLabel]);

  const accountFilterActive = accountFilter.length > 0 && accountFilter.length < filterCards.length;
  const hasAnyFilter =
    !!from || !!to || typeFilter.length > 0 || accountFilterActive || bucketFilter.length > 0 || subFilter.length > 0;
  const clearAll = () => {
    setFrom(""); setTo("");
    setTypeFilter([]); setAccountFilter(filterCards.map((a) => a.id)); setBucketFilter([]); setSubFilter([]);
  };

  const pendingPayments = pendingDelete ? (paymentsByTx[pendingDelete.id] ?? []) : [];
  const pendingPaid = pendingPayments.reduce((s, p) => s + Number(p.payment_amount), 0);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.is_credit_card) {
        const payTxIds = pendingPayments
          .map((p) => p.payment_transaction_id)
          .filter((x): x is string => !!x);
        await deleteCreditCardTransaction(pendingDelete.id, payTxIds);
      } else {
        const { error } = await supabase.from("transactions").delete().eq("id", pendingDelete.id);
        if (error) throw error;
      }
    } catch (e) {
      setDeleting(false);
      toast.error(e instanceof Error ? e.message : "Could not delete the transaction");
      return;
    }
    setDeleting(false);
    // Optimistic cache update
    qc.setQueryData<Awaited<ReturnType<typeof fetchAll>>>(["finance", user!.id], (prev) =>
      prev ? { ...prev, transactions: prev.transactions.filter((x) => x.id !== pendingDelete.id) } : prev,
    );
    qc.invalidateQueries({ queryKey: ["finance", user!.id] });
    toast.success("Transaction deleted");
    setPendingDelete(null);
  }

  if (loading || !session) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const accountById = Object.fromEntries(filterCards.map((a) => [a.id, a]));

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <PageHeader title="Transactions" description="Every income, expense, transfer, contribution, and accrual." />
        <div className="flex items-center gap-2 pt-1">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add</Button>
            </DialogTrigger>
            <AddTransactionDialog
              accounts={accounts}
              creditCardAccount={creditCardAccount}
              categories={categories}
              funds={funds}
              reserves={reserves}
              investments={investments}
              userId={user!.id}
              onSaved={() => {
                setDialogOpen(false);
                qc.invalidateQueries({ queryKey: ["finance", user!.id] });
              }}
            />
          </Dialog>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {filterCards.length > 0 ? (
        <div className="mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filterCards.map((a) => {
              const selected = accountFilter.includes(a.id);
              const isCard = a.id === creditCardAccount?.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAccount(a.id)}
                  className={
                    "relative text-left w-full min-w-0 rounded-xl border transition-all " +
                    (selected
                      ? isCard
                        ? "border-warning bg-warning/10 shadow-sm"
                        : "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-card opacity-60 hover:opacity-80")
                  }
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="text-xs text-muted-foreground truncate">{a.name}</div>
                      {selected ? (
                        <div className={
                          "rounded-full p-0.5 " +
                          (isCard ? "bg-warning text-background" : "bg-primary text-primary-foreground")
                        }>
                          <Check className="h-3 w-3" />
                        </div>
                      ) : null}
                    </div>
                    <div className={
                      "text-lg font-semibold tabular-nums break-words " + (isCard ? "text-warning" : "")
                    }>
                      {formatINR(isCard ? ccTotalOutstanding : (balances[a.id] ?? 0))}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {isCard ? "Outstanding balance" : "Current balance"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {accountFilter.length === 0 || accountFilter.length === filterCards.length
              ? "Showing all accounts"
              : `Showing: ${filterCards.filter((a) => accountFilter.includes(a.id)).map((a) => a.name).join(", ")}`}
          </div>
        </div>
      ) : null}


      <Card className="mb-5">
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="From"><DateInput value={from} onChange={setFrom} /></Field>
          <Field label="To"><DateInput value={to} onChange={setTo} /></Field>
          <Field label="Type">
            <MultiSelect
              placeholder="All types"
              value={typeFilter}
              onChange={setTypeFilter}
              options={(Object.keys(txTypeLabel) as TxType[]).map((k) => ({ value: k, label: txTypeLabel[k] }))}
            />
          </Field>
          <Field label="Bucket">
            <MultiSelect
              placeholder="All buckets"
              value={bucketFilter}
              onChange={(v) => {
                setBucketFilter(v);
                const allowed = new Set(
                  (v.length > 0 ? v : (BUCKETS as readonly string[])).flatMap((b) => subsByBucket[b] ?? []),
                );
                setSubFilter((prev) => prev.filter((s) => allowed.has(s)));
              }}
              options={BUCKETS.map((b) => ({ value: b, label: b }))}
            />
          </Field>
          <Field label="Category">
            <MultiSelect
              placeholder="All categories"
              value={subFilter}
              onChange={setSubFilter}
              options={subOptions}
            />
          </Field>
          {hasAnyFilter ? (
            <div className="col-span-2 md:col-span-5 flex justify-end">
              <Button size="sm" variant="ghost" onClick={clearAll}>Clear all</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Account</th>
                <th className="px-5 py-3 font-medium">Bucket</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const inflow =
                  t.type === "income" ||
                  t.type === "fund_withdrawal";
                const isInternal =
                  t.type === "transfer" ||
                  t.type === "fund_contribution" ||
                  t.type === "reserve_accrual";
                return (
                  <tr key={t.id} className="group border-t border-border">
                    <td className="px-5 py-3.5 tabular-nums text-muted-foreground whitespace-nowrap">{t.date}</td>
                    <td className="px-5 py-3.5">
                      {t.description || <span className="text-muted-foreground">—</span>}
                      {t.destination_account_id ? (
                        <span className="text-xs text-muted-foreground"> → {accountById[t.destination_account_id]?.name ?? ""}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant="secondary" className="font-normal whitespace-nowrap">
                        {txTypeLabel[t.type]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      {t.is_credit_card ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="whitespace-nowrap">Credit Card</span>
                            <Badge
                              variant="outline"
                              className={
                                "font-normal whitespace-nowrap " +
                                (t.credit_card_payment_status === "paid"
                                  ? "border-success/40 bg-success/10 text-success"
                                  : "border-warning/40 bg-warning/10 text-warning")
                              }
                            >
                              {t.credit_card_payment_status === "paid"
                                ? "Paid"
                                : t.credit_card_payment_status === "partial"
                                  ? "Partial"
                                  : "Unpaid"}
                            </Badge>
                          </div>
                          {t.credit_card_payment_status && t.credit_card_payment_status !== "unpaid" ? (
                            <div className="text-[11px] text-muted-foreground">
                              {t.credit_card_payment_status === "paid"
                                ? "Paid in full"
                                : `Paid ${formatINR(Number(t.credit_card_paid_amount ?? 0))} of ${formatINR(Number(t.amount))}`}
                              {paidFromText(paymentsByTx[t.id] ?? [], accountById)
                                ? ` · from ${paidFromText(paymentsByTx[t.id] ?? [], accountById)}`
                                : ""}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        accountById[t.account_id]?.name ?? ""
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                      {t.bucket ? t.bucket : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {t.bucket ? (subLabel(t) || "—") : txTypeLabel[t.type]}
                    </td>
                    <td className={
                      "px-5 py-3.5 text-right tabular-nums font-medium whitespace-nowrap " +
                      (inflow ? "text-success" : isInternal ? "text-muted-foreground" : "text-foreground")
                    }>
                      {inflow ? "+" : isInternal ? "" : "−"}{formatINR(Number(t.amount))}
                    </td>
                    <td className="pr-3 py-3.5 w-8">
                      <div className="flex items-center gap-2 justify-end">
                        {t.is_credit_card && t.credit_card_payment_status !== "paid" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs whitespace-nowrap"
                            onClick={() => setPayingTx(t)}
                          >
                            Log payment
                          </Button>
                        ) : null}
                        <button
                          aria-label="Edit transaction"
                          onClick={() => setEditing(t)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          aria-label="Delete transaction"
                          onClick={() => setPendingDelete(t)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {dataQuery.isLoading ? "Loading…" : "No transactions yet. Use Add to record your first one."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing ? (
          <AddTransactionDialog
            key={editing.id}
            accounts={accounts}
            creditCardAccount={creditCardAccount}
            categories={categories}
            funds={funds}
            reserves={reserves}
            investments={investments}
            userId={user!.id}
            editing={editing}
            onSaved={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["finance", user!.id] });
            }}
          />
        ) : null}
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  {pendingDelete.description || txTypeLabel[pendingDelete.type]} on{" "}
                  {formatDateLong(pendingDelete.date)} — {formatINR(Number(pendingDelete.amount))}.{" "}
                  {pendingDelete.is_credit_card && pendingPaid > 0
                    ? `This transaction has ${formatINR(pendingPaid)} in payments logged. Deleting it will also remove those payment records and reverse the account balance adjustments. Proceed?`
                    : "This cannot be undone."}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatDateLong(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function monthStartISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthEndISO() {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-9 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
      <CalendarIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    </div>
  );
}

interface MSOption { value: string; label: string }
function MultiSelect({
  value, onChange, options, placeholder,
}: { value: string[]; onChange: (v: string[]) => void; options: MSOption[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-left hover:bg-accent/30"
        >
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selected.map((o) => (
                <span
                  key={o.value}
                  className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs"
                >
                  {o.label}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${o.label}`}
                    onClick={(e) => { e.stopPropagation(); toggle(o.value); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggle(o.value); } }}
                    className="rounded hover:bg-muted-foreground/20 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1" align="start">
        <ul className="max-h-60 overflow-auto">
          {options.map((o) => {
            const checked = value.includes(o.value);
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="flex-1 text-left">{o.label}</span>
                </button>
              </li>
            );
          })}
          {options.length === 0 ? (
            <li className="px-2 py-2 text-xs text-muted-foreground">No options</li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function AddTransactionDialog({
  accounts, categories, funds, reserves, investments, userId, onSaved, editing,
}: {
  accounts: AccountRow[];
  categories: CategoryRow[];
  funds: FundRow[];
  reserves: ReserveRow[];
  investments: InvestmentRow[];
  userId: string;
  onSaved: () => void;
  editing?: TxRow;
}) {
  const cub = accounts.find((a) => a.code === "CUB");
  const hdfc = accounts.find((a) => a.code === "HDFC");
  const sbi = accounts.find((a) => a.code === "SBI");
  const taxReserve = reserves.find((r) => !r.name.toLowerCase().includes("floor")) ?? reserves[0];

  const initialBucket = (editing?.bucket as Bucket | undefined) ?? undefined;
  const [mode, setMode] = useState<"bucket" | "other">(
    editing ? (editing.bucket ? "bucket" : "other") : "bucket",
  );
  const [bucket, setBucket] = useState<Bucket | "">(initialBucket ?? "");
  const [otherType, setOtherType] = useState<TxType>(
    editing && !editing.bucket ? editing.type : "income",
  );
  const [sub, setSub] = useState<string>(editing?.sub_category ?? "");

  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [paymentMode, setPaymentMode] = useState<string>(editing?.payment_mode ?? "");
  const [accountId, setAccountId] = useState<string>(editing?.account_id ?? cub?.id ?? accounts[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState<string>(editing?.destination_account_id ?? "");
  const [busy, setBusy] = useState(false);

  const type: TxType = mode === "bucket" && bucket ? bucketTxType[bucket] : otherType;

  const regularCats = categories.filter((c) => c.bucket === "Regular Expenses");
  const fixedCats = categories.filter((c) => c.bucket === "Fixed Commitments");

  const subOptions: string[] =
    bucket === "Regular Expenses" ? regularCats.map((c) => c.name)
    : bucket === "Fixed Commitments" ? fixedCats.map((c) => c.name)
    : bucket === "SIP Investments" ? investments.map((i) => i.name)
    : bucket === "Fund Contributions" ? funds.map((f) => f.name)
    : [];

  // Reset dependent fields when the bucket / non-spending type changes.
  const skipReset = useRef(!!editing);
  useEffect(() => {
    if (skipReset.current) { skipReset.current = false; return; }
    setDestinationId("");
    if (mode === "bucket") {
      setSub(bucket === "Tax Reserve" ? "Tax Reserve" : "");
      if (bucket === "Regular Expenses") setAccountId(cub?.id ?? accounts[0]?.id ?? "");
      else if (bucket === "SIP Investments") setAccountId(hdfc?.id ?? accounts[0]?.id ?? "");
      else setAccountId(sbi?.id ?? accounts[0]?.id ?? "");
    } else {
      setSub("");
      setAccountId(accounts[0]?.id ?? "");
    }
  }, [mode, bucket, otherType, accounts, cub?.id, hdfc?.id, sbi?.id]);

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a positive amount"); return; }
    if (!date) { toast.error("Pick a date"); return; }
    if (mode === "bucket" && !bucket) { toast.error("Pick a bucket"); return; }

    const row: Record<string, unknown> = {
      user_id: userId,
      date,
      type,
      amount: amt,
      description: description.trim(),
      payment_mode: paymentMode.trim() || null,
      account_id: null,
      destination_account_id: null,
      category_id: null,
      fund_id: null,
      reserve_id: null,
      bucket: mode === "bucket" ? bucket : null,
      sub_category: null,
    };

    if (mode === "bucket") {
      if (bucket === "Tax Reserve") {
        if (!taxReserve) return toast.error("No tax reserve configured");
        row.reserve_id = taxReserve.id;
        row.account_id = taxReserve.account_id;
        row.sub_category = "Tax Reserve";
      } else {
        if (!sub) return toast.error("Pick a category");
        if (!accountId) return toast.error("Pick an account");
        row.account_id = accountId;
        row.sub_category = sub;
        if (bucket === "Regular Expenses" || bucket === "Fixed Commitments") {
          const cat = categories.find((c) => c.name === sub);
          if (!cat) return toast.error("Unknown category");
          row.category_id = cat.id;
        } else if (bucket === "Fund Contributions") {
          const f = funds.find((x) => x.name === sub);
          if (!f) return toast.error("Unknown fund");
          row.fund_id = f.id;
        }
      }
    } else if (otherType === "income") {
      if (!accountId) return toast.error("Pick an account");
      row.account_id = accountId;
    } else if (otherType === "transfer" || otherType === "internal_loan_repayment") {
      if (!accountId || !destinationId) return toast.error("Pick both accounts");
      if (accountId === destinationId) return toast.error("Source and destination must differ");
      row.account_id = accountId;
      row.destination_account_id = destinationId;
    } else if (otherType === "fund_withdrawal") {
      if (!accountId) return toast.error("Pick an account");
      if (!sub) return toast.error("Pick a fund");
      const f = funds.find((x) => x.name === sub);
      if (!f) return toast.error("Unknown fund");
      row.account_id = accountId;
      row.fund_id = f.id;
    } else {
      if (!accountId) return toast.error("Pick an account");
      row.account_id = accountId;
    }

    setBusy(true);
    let error;
    if (editing) {
      const { user_id: _omit, ...patch } = row as Record<string, unknown> & { user_id: unknown };
      void _omit;
      ({ error } = await supabase.from("transactions").update(patch as never).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("transactions").insert(row as never));
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Transaction updated" : `${txTypeLabel[type]} saved`);
    if (!editing) { setAmount(""); setDescription(""); setPaymentMode(""); }
    onSaved();
  }

  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
      </DialogHeader>

      {/* Step 1 — Level 1 bucket */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">Bucket</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {BUCKETS.map((b) => {
            const active = mode === "bucket" && bucket === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => { setMode("bucket"); setBucket(b); }}
                className={
                  "rounded-md border px-3 py-2 text-xs text-left transition-colors " +
                  (active
                    ? "border-primary bg-primary/10 text-foreground font-medium"
                    : "border-input hover:bg-accent/40 text-muted-foreground")
                }
              >
                {b}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMode("other")}
            className={
              "rounded-md border px-3 py-2 text-xs text-left transition-colors " +
              (mode === "other"
                ? "border-primary bg-primary/10 text-foreground font-medium"
                : "border-input hover:bg-accent/40 text-muted-foreground")
            }
          >
            Non-spending transaction
          </button>
        </div>
        {mode === "bucket" && bucket ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Type: <span className="text-foreground font-medium">{txTypeLabel[type]}</span> (set automatically)
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Step 2 — Level 2 sub-category */}
        {mode === "bucket" && bucket && bucket !== "Tax Reserve" ? (
          <Field label="Category">
            <Select value={sub} onValueChange={setSub}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {subOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {mode === "bucket" && bucket === "Tax Reserve" ? (
          <Field label="Category">
            <Input value="Tax Reserve" readOnly className="bg-muted/40" />
          </Field>
        ) : null}

        {mode === "other" ? (
          <Field label="Type">
            <Select value={otherType} onValueChange={(v) => setOtherType(v as TxType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {nonSpendingTypes.map((k) => (
                  <SelectItem key={k} value={k}>{txTypeLabel[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Amount (₹)">
          <Input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
          />
        </Field>

        {mode === "other" && otherType === "fund_withdrawal" ? (
          <Field label="Fund">
            <Select value={sub} onValueChange={setSub}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {funds.map((f) => <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {/* Accounts */}
        {!(mode === "bucket" && bucket === "Tax Reserve") ? (
          <Field label={type === "transfer" || type === "internal_loan_repayment" ? "From account" : "Account"}>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {mode === "other" && (otherType === "transfer" || otherType === "internal_loan_repayment") ? (
          <Field label="To account">
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {accounts.filter((a) => a.id !== accountId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {type === "expense" || type === "income" ? (
          <Field label="Payment mode">
            <Input value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} placeholder="UPI / Card / Cash" />
          </Field>
        ) : null}

        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note" />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Save transaction"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
