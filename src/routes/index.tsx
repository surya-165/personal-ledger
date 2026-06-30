import { createFileRoute } from "@tanstack/react-router";
import {
  categories,
  funds,
  formatINR,
  transactions,
  isInMonth,
  currentMonth,
} from "@/lib/finance-data";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Ledger" },
      { name: "description", content: "This month's income, spending, fund contributions, and where the rest went." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const monthTx = transactions.filter((t) => isInMonth(t.date));
  const sumWhere = (pred: (t: (typeof monthTx)[number]) => boolean) =>
    monthTx.filter(pred).reduce((s, t) => s + t.amount, 0);

  const income = sumWhere((t) => t.type === "income");
  const variableSpent = categories.reduce((s, c) => s + c.spent, 0);
  const variableLimit = categories.reduce((s, c) => s + c.limit, 0);
  const fixedOut = -sumWhere((t) => t.type === "expense" && t.category === "Fixed");
  const reserveOut = -sumWhere((t) => t.type === "reserve_accrual");
  const fundsOut = -sumWhere((t) => t.type === "fund_contribution");
  // Net household transfers (should be zero across own accounts) — show outbound side.
  const transfersOut = -sumWhere((t) => t.type === "transfer" && t.amount < 0);
  const unallocated = income - variableSpent - fixedOut - reserveOut - fundsOut;

  // Day-pace: fraction of month elapsed (using a fixed current-month date).
  const [yStr, mStr] = currentMonth.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const today = new Date(year, month - 1, 30); // pin to the snapshot date (Jun 30, 2026)
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = today.getDate();
  const pace = dayOfMonth / daysInMonth;

  const monthLabel = today.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div>
      <PageHeader
        title={monthLabel}
        description={`Day ${dayOfMonth} of ${daysInMonth} · where this month's income is going.`}
      />

      {/* Headline: monthly income */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Income this month
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <div className="text-4xl font-semibold tabular-nums tracking-tight">
              {formatINR(income)}
            </div>
            <div className="text-sm text-muted-foreground">salary + net rent</div>
          </div>
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-muted flex">
            <Seg amount={fixedOut} total={income} className="bg-foreground/70" />
            <Seg amount={variableSpent} total={income} className="bg-primary/70" />
            <Seg amount={reserveOut} total={income} className="bg-warning/60" />
            <Seg amount={fundsOut} total={income} className="bg-success/60" />
            <Seg amount={Math.max(0, unallocated)} total={income} className="bg-muted-foreground/20" />
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <Legend swatch="bg-foreground/70" label="Fixed" value={formatINR(fixedOut)} />
            <Legend swatch="bg-primary/70" label="Variable" value={formatINR(variableSpent)} />
            <Legend swatch="bg-warning/60" label="Reserves" value={formatINR(reserveOut)} />
            <Legend swatch="bg-success/60" label="Funds" value={formatINR(fundsOut)} />
            <Legend
              swatch="bg-muted-foreground/20"
              label="Unallocated"
              value={formatINR(unallocated)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Budgets + Funds */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-base font-medium">Spend vs budget</CardTitle>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatINR(variableSpent)} / {formatINR(variableLimit)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {categories.map((c) => {
              const pct = Math.min(100, Math.round((c.spent / c.limit) * 100));
              const expected = c.limit * pace;
              const over = c.spent > c.limit;
              const ahead = !over && c.spent > expected * 1.05;
              const under = c.spent < expected * 0.7;
              const tag = over
                ? { text: `Over by ${formatINR(c.spent - c.limit)}`, cls: "text-destructive" }
                : ahead
                  ? { text: "Ahead of pace", cls: "text-warning" }
                  : under
                    ? { text: "Under pace", cls: "text-success" }
                    : { text: "On pace", cls: "text-muted-foreground" };
              return (
                <div key={c.name}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatINR(c.spent)} / {formatINR(c.limit)}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={pct} />
                    <div
                      className="absolute top-0 h-2 w-px bg-foreground/40"
                      style={{ left: `${Math.min(100, pace * 100)}%` }}
                      aria-hidden
                    />
                  </div>
                  <div className={"mt-1 text-xs tabular-nums " + tag.cls}>{tag.text}</div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-2 border-t border-border">
              Tick mark shows day-of-month pace ({Math.round(pace * 100)}%).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Fund contributions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {funds.map((f) => {
              const pct = Math.min(
                100,
                Math.round((f.contributedThisMonth / f.monthlyTarget) * 100),
              );
              const remaining = Math.max(0, f.monthlyTarget - f.contributedThisMonth);
              return (
                <div key={f.id}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatINR(f.contributedThisMonth)} / {formatINR(f.monthlyTarget)}
                    </span>
                  </div>
                  <Progress value={pct} />
                  <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {remaining > 0 ? `${formatINR(remaining)} left this month` : "Target met"}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Where the rest went */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Where it went</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            <WaterfallRow label="Income" sub="Salary + net rent" amount={income} positive />
            <WaterfallRow
              label="Internal transfers"
              sub="HDFC → CUB spending allowance (net zero across accounts)"
              amount={-transfersOut}
              muted
            />
            <WaterfallRow
              label="Fixed expenses"
              sub="Car EMI, Apartment Maintenance"
              amount={-fixedOut}
            />
            <WaterfallRow
              label="Variable expenses"
              sub="Across budget categories"
              amount={-variableSpent}
            />
            <WaterfallRow
              label="Reserve accruals"
              sub="SBI Tax Reserve"
              amount={-reserveOut}
              muted
            />
            <WaterfallRow
              label="Fund contributions"
              sub="Corpus + Trip"
              amount={-fundsOut}
              muted
            />
            <WaterfallRow label="Unallocated remainder" amount={unallocated} positive bold />
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Internal transfers shown for transparency; they do not reduce household money.
            Fund withdrawals are excluded.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Seg({
  amount,
  total,
  className,
}: {
  amount: number;
  total: number;
  className: string;
}) {
  const pct = total > 0 ? Math.max(0, (amount / total) * 100) : 0;
  if (pct <= 0) return null;
  return <div className={"h-full " + className} style={{ width: `${pct}%` }} />;
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={"h-2 w-2 rounded-full " + swatch} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto tabular-nums">{value}</span>
    </div>
  );
}

function WaterfallRow({
  label,
  sub,
  amount,
  positive,
  muted,
  bold,
}: {
  label: string;
  sub?: string;
  amount: number;
  positive?: boolean;
  muted?: boolean;
  bold?: boolean;
}) {
  const tone = positive
    ? "text-success"
    : muted
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <li className="flex items-center justify-between py-3">
      <div className="min-w-0">
        <div className={"text-sm " + (bold ? "font-semibold" : "")}>{label}</div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </div>
      <span className={"tabular-nums text-sm " + (bold ? "font-semibold " : "font-medium ") + tone}>
        {formatINR(amount)}
      </span>
    </li>
  );
}
