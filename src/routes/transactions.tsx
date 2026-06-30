import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAll,
  seedIfEmpty,
  formatINR,
  txTypeLabel,
  computeAccountBalances,
  type TxType,
  type AccountRow,
  type CategoryRow,
  type FundRow,
  type ReserveRow,
  type TxRow,
} from "@/lib/finance-db";
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

const ALL = "__all__";

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

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [accountFilter, setAccountFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [dialogOpen, setDialogOpen] = useState(false);

  const data = dataQuery.data;
  const transactions = data?.transactions ?? [];
  const accounts = data?.accounts ?? [];
  const categories = data?.categories ?? [];
  const funds = data?.funds ?? [];
  const reserves = data?.reserves ?? [];

  const balances = useMemo(
    () => computeAccountBalances(accounts, transactions),
    [accounts, transactions],
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (typeFilter !== ALL && t.type !== (typeFilter as TxType)) return false;
      if (accountFilter !== ALL && t.account_id !== accountFilter) return false;
      if (categoryFilter !== ALL && t.category_id !== categoryFilter) return false;
      return true;
    });
  }, [transactions, from, to, typeFilter, accountFilter, categoryFilter]);

  if (loading || !session) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));

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
              categories={categories}
              funds={funds}
              reserves={reserves}
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

      {accounts.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground">{a.name}</div>
                <div className="text-lg font-semibold tabular-nums">{formatINR(balances[a.id] ?? 0)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="mb-5">
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Type">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {(Object.keys(txTypeLabel) as TxType[]).map((k) => (
                  <SelectItem key={k} value={k}>{txTypeLabel[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Account">
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
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
                  <tr key={t.id} className="border-t border-border">
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
                    <td className="px-5 py-3.5">{accountById[t.account_id]?.name ?? ""}</td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      {t.category_id ? categoryById[t.category_id]?.name : "—"}
                    </td>
                    <td className={
                      "px-5 py-3.5 text-right tabular-nums font-medium whitespace-nowrap " +
                      (inflow ? "text-success" : isInternal ? "text-muted-foreground" : "text-foreground")
                    }>
                      {inflow ? "+" : isInternal ? "" : "−"}{formatINR(Number(t.amount))}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {dataQuery.isLoading ? "Loading…" : "No transactions yet. Use Add to record your first one."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
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
  accounts, categories, funds, reserves, userId, onSaved,
}: {
  accounts: AccountRow[];
  categories: CategoryRow[];
  funds: FundRow[];
  reserves: ReserveRow[];
  userId: string;
  onSaved: () => void;
}) {
  const cub = accounts.find((a) => a.code === "CUB");
  const sbi = accounts.find((a) => a.code === "SBI");

  const [type, setType] = useState<TxType>("expense");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState<string>("");
  const [accountId, setAccountId] = useState<string>(cub?.id ?? accounts[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [fundId, setFundId] = useState<string>("");
  const [reserveId, setReserveId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // When the type changes, reset to sensible defaults.
  useEffect(() => {
    setCategoryId("");
    setFundId("");
    setReserveId("");
    setDestinationId("");
    if (type === "expense") setAccountId(cub?.id ?? accounts[0]?.id ?? "");
    else if (type === "fund_contribution" || type === "fund_withdrawal")
      setAccountId(sbi?.id ?? accounts[0]?.id ?? "");
    else if (type === "income") setAccountId(accounts[0]?.id ?? "");
    else if (type === "transfer") setAccountId(accounts[0]?.id ?? "");
    // reserve_accrual: account is derived from the chosen reserve
  }, [type, accounts, cub?.id, sbi?.id]);

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a positive amount"); return; }
    if (!date) { toast.error("Pick a date"); return; }

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
    };

    if (type === "expense") {
      if (!accountId) return toast.error("Pick an account");
      if (!categoryId) return toast.error("Pick a category");
      row.account_id = accountId;
      row.category_id = categoryId;
    } else if (type === "income") {
      if (!accountId) return toast.error("Pick an account");
      row.account_id = accountId;
    } else if (type === "transfer") {
      if (!accountId || !destinationId) return toast.error("Pick both accounts");
      if (accountId === destinationId) return toast.error("Source and destination must differ");
      row.account_id = accountId;
      row.destination_account_id = destinationId;
    } else if (type === "fund_contribution" || type === "fund_withdrawal") {
      if (!fundId) return toast.error("Pick a fund");
      if (!accountId) return toast.error("Pick an account");
      row.fund_id = fundId;
      row.account_id = accountId;
    } else if (type === "reserve_accrual") {
      if (!reserveId) return toast.error("Pick a reserve");
      const r = reserves.find((x) => x.id === reserveId);
      if (!r) return toast.error("Unknown reserve");
      row.reserve_id = reserveId;
      row.account_id = r.account_id;
    }

    setBusy(true);
    const { error } = await supabase.from("transactions").insert(row as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${txTypeLabel[type]} saved`);
    setAmount(""); setDescription(""); setPaymentMode("");
    onSaved();
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Add transaction</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={type} onValueChange={(v) => setType(v as TxType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(txTypeLabel) as TxType[]).map((k) => (
                <SelectItem key={k} value={k}>{txTypeLabel[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Amount (₹)">
          <Input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
          />
        </Field>

        {/* expense / income */}
        {(type === "expense" || type === "income") && (
          <Field label="Account">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        {type === "expense" && (
          <Field label="Category">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        {(type === "expense" || type === "income") && (
          <Field label="Payment mode">
            <Input value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} placeholder="UPI / Card / Cash" />
          </Field>
        )}

        {/* transfer */}
        {type === "transfer" && (
          <>
            <Field label="From account">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
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
          </>
        )}

        {/* fund moves */}
        {(type === "fund_contribution" || type === "fund_withdrawal") && (
          <>
            <Field label="Fund">
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Account">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        {/* reserve accrual */}
        {type === "reserve_accrual" && (
          <Field label="Reserve">
            <Select value={reserveId} onValueChange={setReserveId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {reserves.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        {type !== "reserve_accrual" && (
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note" />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save transaction"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}