import { createFileRoute } from "@tanstack/react-router";
import {
  accounts,
  categories,
  funds,
  monthlyIncome,
  formatINR,
  transactions,
} from "@/lib/finance-data";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Ledger" },
      { name: "description", content: "Overview of accounts, budgets, funds, and monthly cashflow." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalReserved = accounts.reduce((s, a) => s + a.reserved, 0);
  const usable = totalBalance - totalReserved;
  const totalSpent = categories.reduce((s, c) => s + c.spent, 0);
  const totalLimit = categories.reduce((s, c) => s + c.limit, 0);
  const recent = transactions.slice(0, 6);

  const waterfall = [
    { label: "Income", amount: monthlyIncome, tone: "positive" as const },
    { label: "Reserves accrued", amount: -4200, tone: "neutral" as const },
    { label: "Fund contributions", amount: -27000, tone: "neutral" as const },
    { label: "Expenses", amount: -totalSpent, tone: "negative" as const },
    { label: "Unallocated", amount: monthlyIncome - 4200 - 27000 - totalSpent, tone: "positive" as const },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="A snapshot of where money sits and where it's going this month." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total balance" value={formatINR(totalBalance)} sub={`across ${accounts.length} accounts`} />
        <StatCard label="Usable" value={formatINR(usable)} sub={`${formatINR(totalReserved)} reserved`} />
        <StatCard label="Spent this month" value={formatINR(totalSpent)} sub={`of ${formatINR(totalLimit)} budgeted`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium">Monthly waterfall</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {waterfall.map((w) => (
                <li key={w.label} className="flex items-center justify-between py-3">
                  <span className="text-sm text-foreground">{w.label}</span>
                  <span
                    className={
                      "tabular-nums text-sm font-medium " +
                      (w.tone === "positive"
                        ? "text-success"
                        : w.tone === "negative"
                        ? "text-destructive"
                        : "text-muted-foreground")
                    }
                  >
                    {formatINR(w.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Excludes internal transfers and fund withdrawals.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Goal funds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {funds.map((f) => {
              const pct = Math.min(100, Math.round((f.contributedThisMonth / f.monthlyTarget) * 100));
              return (
                <div key={f.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatINR(f.contributedThisMonth)} / {formatINR(f.monthlyTarget)}
                    </span>
                  </div>
                  <Progress value={pct} />
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Balance {formatINR(f.balance)}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">{t.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.date} · {t.account}
                      {t.category ? ` · ${t.category}` : ""}
                    </div>
                  </div>
                  <span
                    className={
                      "tabular-nums text-sm font-medium " +
                      (t.amount >= 0 ? "text-success" : "text-foreground")
                    }
                  >
                    {formatINR(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Budgets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categories.slice(0, 5).map((c) => {
              const pct = Math.min(100, Math.round((c.spent / c.limit) * 100));
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatINR(c.spent)} / {formatINR(c.limit)}
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}
