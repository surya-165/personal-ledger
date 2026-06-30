import { createFileRoute } from "@tanstack/react-router";
import { funds, formatINR } from "@/lib/finance-data";
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

function FundsPage() {
  return (
    <div>
      <PageHeader title="Goal funds" description="Both funds live inside SBI. Withdrawals are excluded from monthly income." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {funds.map((f) => {
          const pct = Math.min(100, Math.round((f.contributedThisMonth / f.monthlyTarget) * 100));
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
                  <ul className="divide-y divide-border">
                    {f.ledger.map((e, i) => (
                      <li key={i} className="py-2.5 flex items-center justify-between gap-3">
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
                              (e.kind === "contribution" ? "text-success" : "text-foreground")
                            }
                          >
                            {e.kind === "contribution" ? "+" : "−"}
                            {formatINR(e.amount).replace("-", "")}
                          </span>
                          <span className="tabular-nums text-xs text-muted-foreground w-20 text-right hidden sm:inline">
                            {formatINR(e.running)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}