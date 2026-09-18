import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchAll,
  formatINR,
  computeAccountBalances,
  computeFundBalance,
  computeReserveBalance,
  ccOutstanding,
  type TxRow,
} from "@/lib/finance-db";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCardPaymentDialog } from "@/components/finance/credit-card-payment-dialog";
import { ChevronDown, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Ledger" },
      { name: "description", content: "Balances and reserved portions across HDFC, CUB, and SBI." },
    ],
  }),
  component: AccountsPage,
});

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function AccountsPage() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);

  const q = useQuery({
    queryKey: ["finance", user?.id],
    enabled: !!user,
    queryFn: () => fetchAll(user!.id),
  });

  const [payingTx, setPayingTx] = useState<TxRow | null>(null);
  const [ccListOpen, setCcListOpen] = useState(false);

  const ym = currentMonthKey();
  const monthLabel = new Date(ym + "-01").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const view = useMemo(() => {
    if (!q.data) return [];
    const { accounts, transactions, reserves, funds } = q.data;
    const balances = computeAccountBalances(accounts, transactions);
    return accounts.map((a) => {
      // Reserved = reserves attached to this account + fund balances held in this account
      const acctReserves = reserves
        .filter((r) => r.account_id === a.id)
        .map((r) => ({ label: r.name, amount: computeReserveBalance(r, transactions) }));
      const acctFunds = funds
        .filter((f) => f.account_id === a.id)
        .map((f) => ({ label: f.name, amount: computeFundBalance(f, transactions) }));
      const breakdown = [...acctReserves, ...acctFunds].filter((r) => r.amount > 0);
      const reserved = breakdown.reduce((s, r) => s + r.amount, 0);
      const balance = balances[a.id] ?? 0;
      const usable = balance - reserved;

      // Monthly flow: sum in/out affecting this account this month
      let inflow = 0;
      let outflow = 0;
      for (const t of transactions) {
        if (!t.date.startsWith(ym)) continue;
        const amt = Number(t.amount);
        if (t.type === "income" || t.type === "fund_withdrawal") {
          if (t.account_id === a.id) inflow += amt;
        } else if (t.type === "expense" || t.type === "fund_contribution") {
          if (t.account_id === a.id) outflow += amt;
        } else if (t.type === "transfer") {
          if (t.account_id === a.id) outflow += amt;
          if (t.destination_account_id === a.id) inflow += amt;
        }
        // reserve_accrual: earmark only — does not change balance
      }
      return { a, balance, reserved, usable, breakdown, inflow, outflow, net: inflow - outflow };
    });
  }, [q.data, ym]);

  if (loading || !session) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const cc = q.data?.creditCardAccount ?? null;
  const ccPayments = q.data?.creditCardPayments ?? [];
  const ccTxs = (q.data?.transactions ?? []).filter((t) => t.is_credit_card);
  const openTxs = ccTxs.filter((t) => t.credit_card_payment_status !== "paid");
  const unpaidTxs = openTxs.filter((t) => t.credit_card_payment_status === "unpaid");
  const partialTxs = openTxs.filter((t) => t.credit_card_payment_status === "partial");
  const ccOutstandingTotal = openTxs.reduce((s, t) => s + ccOutstanding(t), 0);
  const unpaidTotal = unpaidTxs.reduce((s, t) => s + Number(t.amount), 0);
  const partialRemaining = partialTxs.reduce((s, t) => s + ccOutstanding(t), 0);
  const ccSpentMonth = ccTxs
    .filter((t) => t.date.startsWith(ym))
    .reduce((s, t) => s + Number(t.amount), 0);
  const ccPaidMonth = ccPayments
    .filter((p) => p.payment_date.startsWith(ym))
    .reduce((s, p) => s + Number(p.payment_amount), 0);

  return (
    <div>
      <PageHeader
        title="Accounts"
        description={`Balances, reserved portions, and this month's flow (${monthLabel}).`}
      />
      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading accounts…</div>
      ) : view.length === 0 ? (
        <div className="text-sm text-muted-foreground">No accounts yet. Complete Setup first.</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {view.map(({ a, balance, reserved, usable, breakdown, inflow, outflow, net }) => {
          const reservedPct = balance > 0 ? Math.max(0, Math.min(100, (reserved / balance) * 100)) : 0;
          return (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex items-baseline justify-between">
                  <CardTitle className="text-base font-medium">{a.name}</CardTitle>
                  <span className="text-xs text-muted-foreground">{a.role}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums tracking-tight">
                  {formatINR(usable)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Usable · {formatINR(balance)} total
                </div>
                <div className="mt-5 h-2 w-full rounded-full bg-muted overflow-hidden flex">
                  <div className="h-full bg-primary/70" style={{ width: `${100 - reservedPct}%` }} />
                  <div className="h-full bg-warning/60" style={{ width: `${reservedPct}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Total balance</div>
                    <div className="tabular-nums font-medium">{formatINR(balance)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Reserved</div>
                    <div className="tabular-nums font-medium">{formatINR(reserved)}</div>
                  </div>
                </div>
                {breakdown.length > 0 ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Reserved breakdown
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {breakdown.map((r) => (
                        <li key={r.label} className="flex justify-between">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span className="tabular-nums">{formatINR(r.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-5 border-t border-border pt-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    This month
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">In</div>
                      <div className="tabular-nums font-medium text-success">
                        {formatINR(inflow)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Out</div>
                      <div className="tabular-nums font-medium">{formatINR(-outflow)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Net</div>
                      <div
                        className={
                          "tabular-nums font-medium " +
                          (net >= 0 ? "text-success" : "text-destructive")
                        }
                      >
                        {formatINR(net)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}

      {cc ? (
        <Card className="mt-6 border-warning/50 bg-warning/5">
          <CardHeader>
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-base font-medium">Credit Card</CardTitle>
              <span className="text-xs text-muted-foreground">Liability</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight text-warning">
              {formatINR(ccOutstandingTotal)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Outstanding balance · money owed
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {unpaidTxs.length} unpaid transaction{unpaidTxs.length === 1 ? "" : "s"}
                </span>
                <span className="tabular-nums font-medium">{formatINR(unpaidTotal)} total</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {partialTxs.length} partially paid
                </span>
                <span className="tabular-nums font-medium">{formatINR(partialRemaining)} remaining</span>
              </div>
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                This month
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Spent on card</div>
                  <div className="tabular-nums font-medium">{formatINR(ccSpentMonth)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Paid this month</div>
                  <div className="tabular-nums font-medium text-success">{formatINR(ccPaidMonth)}</div>
                </div>
              </div>
            </div>
            {openTxs.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setCcListOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                >
                  {ccListOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Unpaid list ({openTxs.length})
                </button>
                {ccListOpen ? (
                  <ul className="mt-3 space-y-2.5">
                    {openTxs.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{t.description || "Card expense"}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.date} · {formatINR(Number(t.amount))}
                            {Number(t.credit_card_paid_amount ?? 0) > 0
                              ? ` · paid ${formatINR(Number(t.credit_card_paid_amount))}`
                              : ""}
                            {" · "}outstanding {formatINR(ccOutstanding(t))}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPayingTx(t)}
                          className="shrink-0 rounded-md border border-input px-2.5 py-1 text-xs hover:bg-accent/40 transition-colors"
                        >
                          Log payment
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {user ? (
        <CreditCardPaymentDialog
          tx={payingTx}
          accounts={q.data?.accounts ?? []}
          creditCardAccountId={cc?.id ?? null}
          userId={user.id}
          onClose={() => setPayingTx(null)}
          onSaved={() => { setPayingTx(null); q.refetch(); }}
        />
      ) : null}
    </div>
  );
}