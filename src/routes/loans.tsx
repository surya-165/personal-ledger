import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAll,
  formatINR,
  type AccountRow,
  type CategoryRow,
  type LoanRow,
  type TxRow,
} from "@/lib/finance-db";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/loans")({
  head: () => ({
    meta: [
      { title: "Loans — Ledger" },
      { name: "description", content: "External loans given out and internal self-loans repaid over time." },
    ],
  }),
  component: LoansPage,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* -------------------------------------------------- balances -------- */

function outstandingForLoan(loan: LoanRow, txs: TxRow[]): { repaid: number; outstanding: number } {
  let repaid = 0;
  for (const t of txs) {
    if (t.loan_id !== loan.id) continue;
    if (loan.loan_type === "external" && t.type === "loan_received") repaid += Number(t.amount);
    if (loan.loan_type === "internal" && t.type === "internal_loan_repayment") repaid += Number(t.amount);
  }
  const outstanding = Math.max(0, Number(loan.principal_amount) - repaid);
  return { repaid, outstanding };
}

/* -------------------------------------------------- page ------------ */

function LoansPage() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const q = useQuery({
    queryKey: ["finance", user?.id],
    enabled: !!user,
    queryFn: () => fetchAll(user!.id),
  });

  const [dialog, setDialog] = useState<null | { kind: "new-external" | "new-internal" }>(null);

  if (loading || !session) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (q.isLoading || !q.data) return <div className="text-sm text-muted-foreground">Loading loans…</div>;

  const { accounts, categories, loans, transactions } = q.data;
  const external = loans.filter((l) => l.loan_type === "external");
  const internal = loans.filter((l) => l.loan_type === "internal");

  const refresh = () => qc.invalidateQueries({ queryKey: ["finance", user!.id] });

  return (
    <div>
      <PageHeader
        title="Loans"
        description="Money lent out to others, and self-loans from SBI repaid monthly from CUB."
      />

      {/* External */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            External loans
          </h2>
          <Dialog
            open={dialog?.kind === "new-external"}
            onOpenChange={(o) => setDialog(o ? { kind: "new-external" } : null)}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" /> New disbursement
              </Button>
            </DialogTrigger>
            <NewExternalDialog
              accounts={accounts}
              userId={user!.id}
              onSaved={() => { setDialog(null); refresh(); }}
            />
          </Dialog>
        </div>
        {external.length === 0 ? (
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">
            No external loans. Log one when you lend money to someone.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {external.map((l) => (
              <ExternalLoanCard
                key={l.id}
                loan={l}
                accounts={accounts}
                transactions={transactions}
                userId={user!.id}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </section>

      {/* Internal */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Internal (self) loans
          </h2>
          <Dialog
            open={dialog?.kind === "new-internal"}
            onOpenChange={(o) => setDialog(o ? { kind: "new-internal" } : null)}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" /> New self-loan
              </Button>
            </DialogTrigger>
            <NewInternalDialog
              accounts={accounts}
              categories={categories}
              userId={user!.id}
              onSaved={() => { setDialog(null); refresh(); }}
            />
          </Dialog>
        </div>
        {internal.length === 0 ? (
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">
            No self-loans yet. Log one for a bulk upfront cost (e.g. annual gym) you want to spread across months.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {internal.map((l) => (
              <InternalLoanCard
                key={l.id}
                loan={l}
                accounts={accounts}
                categories={categories}
                transactions={transactions}
                userId={user!.id}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------- shared ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

async function markSettled(loanId: string) {
  const { error } = await supabase.from("loans" as never).update({ status: "settled" } as never).eq("id", loanId);
  if (error) toast.error(error.message);
}

async function autoSettleIfZero(loanId: string, outstanding: number) {
  if (outstanding <= 0.5) await markSettled(loanId);
}

function RepaymentHistory({
  loan, transactions, accounts,
}: { loan: LoanRow; transactions: TxRow[]; accounts: AccountRow[] }) {
  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const rows = transactions
    .filter((t) => t.loan_id === loan.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground">No transactions yet.</div>;
  }
  return (
    <ul className="divide-y divide-border text-sm">
      {rows.map((t) => {
        const isInitial =
          (loan.loan_type === "external" && t.type === "loan_given") ||
          (loan.loan_type === "internal" && t.type === "expense");
        const label = isInitial
          ? "Disbursement"
          : loan.loan_type === "external"
            ? "Repayment received"
            : "Monthly installment";
        const sign = isInitial ? "−" : "+";
        return (
          <li key={t.id} className="flex items-center justify-between py-2.5">
            <div className="min-w-0">
              <div className="text-sm">{label}</div>
              <div className="text-xs text-muted-foreground">
                {t.date} · {accountById[t.account_id]?.name ?? ""}
                {t.destination_account_id ? ` → ${accountById[t.destination_account_id]?.name ?? ""}` : ""}
                {t.description ? ` · ${t.description}` : ""}
              </div>
            </div>
            <span className={"tabular-nums text-sm " + (isInitial ? "text-foreground" : "text-success")}>
              {sign}{formatINR(Number(t.amount))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------- external card --- */

function ExternalLoanCard({
  loan, accounts, transactions, userId, onChanged,
}: {
  loan: LoanRow;
  accounts: AccountRow[];
  transactions: TxRow[];
  userId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const { repaid, outstanding } = outstandingForLoan(loan, transactions);
  const pct = Math.min(100, Math.round((repaid / Math.max(1, Number(loan.principal_amount))) * 100));
  const disbAcct = accounts.find((a) => a.id === loan.disbursement_account_id);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-medium truncate">
              {loan.borrower_name || loan.name}
            </CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              {loan.name} · Disbursed {loan.disbursement_date} from {disbAcct?.name ?? "—"}
            </div>
          </div>
          <StatusBadge status={loan.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Principal" value={formatINR(Number(loan.principal_amount))} />
          <Stat label="Repaid" value={formatINR(repaid)} tone="success" />
          <Stat label="Outstanding" value={formatINR(outstanding)} tone="strong" />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-success/70" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          {loan.status === "active" ? (
            <Dialog open={repayOpen} onOpenChange={setRepayOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">Log repayment</Button>
              </DialogTrigger>
              <ExternalRepaymentDialog
                loan={loan}
                accounts={accounts}
                outstanding={outstanding}
                userId={userId}
                onSaved={() => { setRepayOpen(false); onChanged(); }}
              />
            </Dialog>
          ) : null}
          {loan.status === "active" ? (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={async () => { await markSettled(loan.id); onChanged(); }}
            >
              <CheckCircle2 className="h-4 w-4" /> Mark settled
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto gap-1.5"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            History
          </Button>
        </div>
        {open ? (
          <div className="pt-2 border-t border-border">
            <RepaymentHistory loan={loan} transactions={transactions} accounts={accounts} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InternalLoanCard({
  loan, accounts, categories, transactions, userId, onChanged,
}: {
  loan: LoanRow;
  accounts: AccountRow[];
  categories: CategoryRow[];
  transactions: TxRow[];
  userId: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const { repaid, outstanding } = outstandingForLoan(loan, transactions);
  const pct = Math.min(100, Math.round((repaid / Math.max(1, Number(loan.principal_amount))) * 100));
  const disbAcct = accounts.find((a) => a.id === loan.disbursement_account_id);
  const repayAcct = accounts.find((a) => a.id === loan.repayment_account_id);
  const cat = categories.find((c) => c.id === loan.category_id);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-medium truncate">{loan.name}</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              {formatINR(Number(loan.principal_amount))} upfront from {disbAcct?.name ?? "—"} · {loan.disbursement_date}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatINR(Number(loan.monthly_installment ?? 0))}/mo from {repayAcct?.name ?? "—"} · {cat?.name ?? "—"}
            </div>
          </div>
          <StatusBadge status={loan.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Principal" value={formatINR(Number(loan.principal_amount))} />
          <Stat label="Repaid" value={formatINR(repaid)} tone="success" />
          <Stat label="Outstanding" value={formatINR(outstanding)} tone="strong" />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-success/70" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          {loan.status === "active" ? (
            <Dialog open={repayOpen} onOpenChange={setRepayOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">Log monthly installment</Button>
              </DialogTrigger>
              <InternalRepaymentDialog
                loan={loan}
                outstanding={outstanding}
                userId={userId}
                onSaved={() => { setRepayOpen(false); onChanged(); }}
              />
            </Dialog>
          ) : null}
          {loan.status === "active" ? (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={async () => { await markSettled(loan.id); onChanged(); }}
            >
              <CheckCircle2 className="h-4 w-4" /> Mark settled
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" className="ml-auto gap-1.5" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            History
          </Button>
        </div>
        {open ? (
          <div className="pt-2 border-t border-border">
            <RepaymentHistory loan={loan} transactions={transactions} accounts={accounts} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "strong" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "tabular-nums " +
          (tone === "success" ? "text-success font-medium " : tone === "strong" ? "font-semibold " : "text-foreground ")
        }
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "settled" }) {
  return status === "settled" ? (
    <Badge variant="secondary" className="bg-success/15 text-success border-transparent">Settled</Badge>
  ) : (
    <Badge variant="secondary" className="font-normal">Active</Badge>
  );
}

/* -------------------------------------------------- dialogs --------- */

function NewExternalDialog({
  accounts, userId, onSaved,
}: { accounts: AccountRow[]; userId: string; onSaved: () => void }) {
  const hdfc = accounts.find((a) => a.code === "HDFC");
  const [borrower, setBorrower] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<string>(hdfc?.id ?? accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const amt = Number(amount);
    if (!borrower.trim()) return toast.error("Enter a borrower name");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a positive amount");
    if (!accountId) return toast.error("Pick a source account");
    setBusy(true);
    const { data: ln, error: lErr } = await supabase
      .from("loans" as never)
      .insert({
        user_id: userId,
        loan_type: "external",
        name: `Loan to ${borrower.trim()}`,
        borrower_name: borrower.trim(),
        disbursement_account_id: accountId,
        principal_amount: amt,
        disbursement_date: date,
        status: "active",
      } as never)
      .select("id")
      .single();
    if (lErr || !ln) { setBusy(false); return toast.error(lErr?.message ?? "Failed"); }
    const loanId = (ln as { id: string }).id;
    const { error: tErr } = await supabase.from("transactions").insert({
      user_id: userId,
      date,
      type: "loan_given" as never,
      account_id: accountId,
      amount: amt,
      description: `Loan to ${borrower.trim()}`,
      loan_id: loanId,
    } as never);
    setBusy(false);
    if (tErr) return toast.error(tErr.message);
    toast.success("Loan disbursed");
    onSaved();
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>New external loan</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Borrower name">
            <Input value={borrower} onChange={(e) => setBorrower(e.target.value)} placeholder="e.g. Rahul" />
          </Field>
        </div>
        <Field label="Amount (₹)">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="From account">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ExternalRepaymentDialog({
  loan, accounts, outstanding, userId, onSaved,
}: {
  loan: LoanRow;
  accounts: AccountRow[];
  outstanding: number;
  userId: string;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(outstanding > 0 ? String(outstanding) : "");
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState<string>(loan.disbursement_account_id);
  const [busy, setBusy] = useState(false);

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a positive amount");
    if (!accountId) return toast.error("Pick a receiving account");
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      date,
      type: "loan_received" as never,
      account_id: accountId,
      amount: amt,
      description: `Repayment from ${loan.borrower_name ?? loan.name}`,
      loan_id: loan.id,
    } as never);
    if (error) { setBusy(false); return toast.error(error.message); }
    await autoSettleIfZero(loan.id, outstanding - amt);
    setBusy(false);
    toast.success("Repayment recorded");
    onSaved();
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Log repayment</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Into account">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="col-span-2 text-xs text-muted-foreground">
          Outstanding: {formatINR(outstanding)}. Loan auto-marks settled when the balance reaches zero.
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewInternalDialog({
  accounts, categories, userId, onSaved,
}: {
  accounts: AccountRow[];
  categories: CategoryRow[];
  userId: string;
  onSaved: () => void;
}) {
  const sbi = accounts.find((a) => a.code === "SBI");
  const cub = accounts.find((a) => a.code === "CUB");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [installment, setInstallment] = useState("");
  const [date, setDate] = useState(todayISO());
  const [disbId, setDisbId] = useState<string>(sbi?.id ?? accounts[0]?.id ?? "");
  const [repayId, setRepayId] = useState<string>(cub?.id ?? accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const amt = Number(amount);
    const inst = Number(installment);
    if (!name.trim()) return toast.error("Enter a description");
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a positive upfront amount");
    if (!Number.isFinite(inst) || inst <= 0) return toast.error("Enter a positive monthly installment");
    if (!disbId) return toast.error("Pick a source account");
    if (!repayId) return toast.error("Pick a repayment source account");
    if (disbId === repayId) return toast.error("Disbursement and repayment accounts must differ");
    if (!categoryId) return toast.error("Pick a budget category");

    setBusy(true);
    const { data: ln, error: lErr } = await supabase
      .from("loans" as never)
      .insert({
        user_id: userId,
        loan_type: "internal",
        name: name.trim(),
        disbursement_account_id: disbId,
        repayment_account_id: repayId,
        category_id: categoryId,
        principal_amount: amt,
        monthly_installment: inst,
        disbursement_date: date,
        status: "active",
      } as never)
      .select("id")
      .single();
    if (lErr || !ln) { setBusy(false); return toast.error(lErr?.message ?? "Failed"); }
    const loanId = (ln as { id: string }).id;

    // Upfront payment recorded as expense against the loan's category so the
    // one-off payment is visible in this month's category spend too.
    const { error: tErr } = await supabase.from("transactions").insert({
      user_id: userId,
      date,
      type: "expense",
      account_id: disbId,
      category_id: categoryId,
      amount: amt,
      description: name.trim(),
      loan_id: loanId,
    } as never);
    setBusy(false);
    if (tErr) return toast.error(tErr.message);
    toast.success("Self-loan created");
    onSaved();
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>New self-loan</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Description">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gym Annual 2026" />
          </Field>
        </div>
        <Field label="Upfront amount (₹)">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid from">
          <Select value={disbId} onValueChange={setDisbId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Repaid from">
          <Select value={repayId} onValueChange={setRepayId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Monthly installment (₹)">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={installment} onChange={(e) => setInstallment(e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Budget category (for monthly installments)">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function InternalRepaymentDialog({
  loan, outstanding, userId, onSaved,
}: {
  loan: LoanRow;
  outstanding: number;
  userId: string;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(
    loan.monthly_installment ? String(loan.monthly_installment) : "",
  );
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  async function save() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a positive amount");
    if (!loan.repayment_account_id || !loan.disbursement_account_id || !loan.category_id) {
      return toast.error("This loan is missing its accounts or category — recreate it");
    }
    setBusy(true);
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      date,
      type: "internal_loan_repayment" as never,
      account_id: loan.repayment_account_id, // source: CUB
      destination_account_id: loan.disbursement_account_id, // credit: SBI
      category_id: loan.category_id,
      amount: amt,
      description: `${loan.name} · installment`,
      loan_id: loan.id,
    } as never);
    if (error) { setBusy(false); return toast.error(error.message); }
    await autoSettleIfZero(loan.id, outstanding - amt);
    setBusy(false);
    toast.success("Installment recorded");
    onSaved();
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>Log monthly installment</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="col-span-2 text-xs text-muted-foreground">
          Debits repayment account, credits the disbursement account, and counts toward the loan's budget category.
          Outstanding: {formatINR(outstanding)}.
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}