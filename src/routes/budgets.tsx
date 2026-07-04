import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchAll, formatINR } from "@/lib/finance-db";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — Ledger" },
      { name: "description", content: "Category spending against monthly limits." },
    ],
  }),
  component: BudgetsPage,
});

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function BudgetsPage() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !session) navigate({ to: "/auth" }); }, [loading, session, navigate]);

  const q = useQuery({
    queryKey: ["finance", user?.id],
    enabled: !!user,
    queryFn: () => fetchAll(user!.id),
  });

  const ym = currentMonthKey();

  const rows = useMemo(() => {
    if (!q.data) return [];
    const { categories, transactions } = q.data;
    const spentByCat: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== "expense" && t.type !== "internal_loan_repayment") continue;
      if (!t.category_id) continue;
      if (!t.date.startsWith(ym)) continue;
      spentByCat[t.category_id] = (spentByCat[t.category_id] ?? 0) + Number(t.amount);
    }
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      limit: Number(c.monthly_limit),
      spent: spentByCat[c.id] ?? 0,
    }));
  }, [q.data, ym]);

  const totalSpent = rows.reduce((s, c) => s + c.spent, 0);
  const totalLimit = rows.reduce((s, c) => s + c.limit, 0);

  if (loading || !session) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div>
      <PageHeader title="Budgets" description="Spent vs. limit across categories this month." />
      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading budgets…</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          No categories yet. Add category budgets in Setup.
        </CardContent></Card>
      ) : (
      <>
      <Card className="mb-6">
        <CardContent className="pt-6 flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">
              {formatINR(totalSpent)} <span className="text-base font-normal text-muted-foreground">of {formatINR(totalLimit)}</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0}%
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 space-y-5">
          {rows.map((c) => {
            const pct = c.limit > 0 ? Math.min(100, Math.round((c.spent / c.limit) * 100)) : 0;
            const over = c.spent > c.limit;
            const near = !over && pct >= 90;
            return (
              <div key={c.id}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{c.name}</div>
                    {over ? (
                      <Badge variant="secondary" className="bg-destructive/15 text-destructive border-transparent">Over</Badge>
                    ) : near ? (
                      <Badge variant="secondary" className="bg-warning/15 text-warning border-transparent">Near limit</Badge>
                    ) : null}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {formatINR(c.spent)} / {formatINR(c.limit)}
                  </div>
                </div>
                <Progress value={pct} />
                <div className="mt-1 text-xs tabular-nums">
                  <span className={over ? "text-destructive" : near ? "text-warning" : "text-muted-foreground"}>
                    {c.limit === 0
                      ? "No limit set"
                      : over
                        ? `Over by ${formatINR(c.spent - c.limit)}`
                        : `${formatINR(c.limit - c.spent)} left`}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}