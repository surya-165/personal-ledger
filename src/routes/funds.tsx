import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchAll, formatINR } from "@/lib/finance-db";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/funds")({
  head: () => ({
    meta: [
      { title: "Funds — Ledger" },
      { name: "description", content: "Corpus and Trip goal funds — contributions, withdrawals, balances." },
    ],
  }),
  component: FundsPage,
});

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function FundsPage() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);

  const q = useQuery({
    queryKey: ["finance", user?.id],
    enabled: !!user,
    queryFn: () => fetchAll(user!.id),
  });

  const ym = currentMonthKey();
  const qc = useQueryClient();
  const deletePayment = async (id: string, amount: number, fundName: string) => {
    if (!window.confirm(`Remove this ${formatINR(amount)} payment from ${fundName}? This cannot be undone.`)) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment removed");
    qc.invalidateQueries({ queryKey: ["finance"] });
    qc.invalidateQueries({ queryKey: ["surplus-history"] });
  };

  const view = useMemo(() => {
    if (!q.data) return [];
    const { funds, transactions } = q.data;
    return funds.map((f) => {
      // Fund entries: contributions/withdrawals/payments for this fund, chronological ascending for running balance
      const entries = transactions
        .filter((t) =>
          (t.fund_id === f.id && (t.type === "fund_contribution" || t.type === "fund_withdrawal")) ||
          (t.type === "surplus_payment" && t.source_fund_id === f.id))
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date));

      let running = Number(f.opening_balance);
      const withRunning = entries.map((t) => {
        const amt = Number(t.amount);
        if (t.type === "fund_contribution") running += amt;
        else running -= amt;
        const kind = t.type === "fund_contribution" ? "contribution" as const
          : t.type === "surplus_payment" ? "payment" as const : "withdrawal" as const;
        return {
          id: t.id,
          date: t.date,
          kind,
          amount: amt,
          description: t.description || (kind === "contribution" ? "Contribution" : kind === "payment" ? "Payment" : "Withdrawal"),
          running,
        };
      });
      const balance = running;
      const contributedThisMonth = withRunning
        .filter((e) => e.kind === "contribution" && e.date.startsWith(ym))
        .reduce((s, e) => s + e.amount, 0);

      return {
        id: f.id,
        name: f.name,
        monthlyTarget: Number(f.monthly_target),
        balance,
        contributedThisMonth,
        ledger: withRunning.slice().reverse(), // newest first
      };
    });
  }, [q.data, ym]);

  if (loading || !session) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div>
      <PageHeader title="Goal funds" description="Both funds live inside SBI. Withdrawals are excluded from monthly income." />
      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading funds…</div>
      ) : view.length === 0 ? (
        <div className="text-sm text-muted-foreground">No funds configured. Complete Setup first.</div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {view.map((f) => {
          const pct = f.monthlyTarget > 0 ? Math.min(100, Math.round((f.contributedThisMonth / f.monthlyTarget) * 100)) : 0;
          return (
            <Card key={f.id}>
              <CardHeader>
                <div className="flex items-baseline justify-between">
                  <CardTitle className="text-base font-medium">{f.name}</CardTitle>
                  <span className="text-xs text-muted-foreground">Held in SBI</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums tracking-tight">{formatINR(f.balance)}</div>
                <div className="text-xs text-muted-foreground mt-1">Current balance</div>
                <div className="mt-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm">This month</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatINR(f.contributedThisMonth)} / {formatINR(f.monthlyTarget)}
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
                <div className="mt-6">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Ledger</div>
                  {f.ledger.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2">No contributions or withdrawals yet.</div>
                  ) : (
                  <ul className="divide-y divide-border">
                    {f.ledger.map((e) => (
                      <li key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm truncate">{e.description}</div>
                          <div className="text-xs text-muted-foreground">{e.date}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="secondary"
                            className={
                              e.kind === "contribution"
                                ? "bg-success/15 text-success border-transparent"
                                : "bg-warning/15 text-warning border-transparent"
                            }
                          >
                            {e.kind}
                          </Badge>
                          <span
                            className={
                              "tabular-nums text-sm font-medium " +
                              (e.kind === "contribution" ? "text-success" : e.kind === "payment" ? "text-destructive" : "text-foreground")
                            }
                          >
                            {e.kind === "contribution" ? "+" : "−"}
                            {formatINR(e.amount).replace("-", "")}
                          </span>
                          <span className="tabular-nums text-xs text-muted-foreground w-20 text-right hidden sm:inline">
                            {formatINR(e.running)}
                          </span>
                          {e.kind === "payment" ? (
                            <button
                              type="button"
                              aria-label="Delete payment"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => deletePayment(e.id, e.amount, f.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}