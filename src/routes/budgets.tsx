import { createFileRoute } from "@tanstack/react-router";
import { categories, formatINR } from "@/lib/finance-data";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — Ledger" },
      { name: "description", content: "Category spending against monthly limits." },
    ],
  }),
  component: BudgetsPage,
});

function BudgetsPage() {
  const totalSpent = categories.reduce((s, c) => s + c.spent, 0);
  const totalLimit = categories.reduce((s, c) => s + c.limit, 0);
  return (
    <div>
      <PageHeader title="Budgets" description="Spent vs. limit across categories this month." />
      <Card className="mb-6">
        <CardContent className="pt-6 flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">
              {formatINR(totalSpent)} <span className="text-base font-normal text-muted-foreground">of {formatINR(totalLimit)}</span>
            </div>
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {Math.round((totalSpent / totalLimit) * 100)}%
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 space-y-5">
          {categories.map((c) => {
            const pct = Math.min(100, Math.round((c.spent / c.limit) * 100));
            const over = c.spent > c.limit;
            const near = !over && pct >= 90;
            return (
              <div key={c.name}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {formatINR(c.spent)} / {formatINR(c.limit)}
                  </div>
                </div>
                <Progress value={pct} />
                <div className="mt-1 text-xs tabular-nums">
                  <span className={over ? "text-destructive" : near ? "text-warning" : "text-muted-foreground"}>
                    {over ? `Over by ${formatINR(c.spent - c.limit)}` : `${formatINR(c.limit - c.spent)} left`}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}