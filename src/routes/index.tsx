import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { fetchAll, seedIfEmpty, formatINR } from "@/lib/finance-db";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RecurringPanel } from "@/components/finance/recurring-panel";

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
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();

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

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = today.getDate();
  const pace = dayOfMonth / daysInMonth;
  const monthLabel = today.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const data = dataQuery.data;
  const categories = data?.categories ?? [];
  const funds = data?.funds ?? [];
  const monthTx = useMemo(
    () => (data?.transactions ?? []).filter((t) => t.date.startsWith(monthPrefix)),
    [data, monthPrefix],
  );

  const sumOf = (pred: (t: (typeof monthTx)[number]) => boolean) =>
    monthTx.filter(pred).reduce((s, t) => s + Number(t.amount), 0);

  const income = sumOf((t) => t.type === "income");
  const expensesOut = sumOf((t) => t.type === "expense");
  const reserveOut = sumOf((t) => t.type === "reserve_accrual");
  const fundsOut = sumOf((t) => t.type === "fund_contribution");
  // Own-account transfers net to zero across the household; show gross for context.
  const transfersGross = sumOf((t) => t.type === "transfer");

  const unallocated = income - expensesOut - reserveOut - fundsOut;
  const variableLimit = categories.reduce((s, c) => s + Number(c.monthly_limit), 0);

  // Per-category spend this month
  const spentByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthTx) {
      if (t.type !== "expense" || !t.category_id) continue;
      m[t.category_id] = (m[t.category_id] ?? 0) + Number(t.amount);
    }
    return m;
  }, [monthTx]);

  // Per-fund contributions this month
  const contribByFund = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthTx) {
      if (t.type !== "fund_contribution" || !t.fund_id) continue;
      m[t.fund_id] = (m[t.fund_id] ?? 0) + Number(t.amount);
    }
    return m;
  }, [monthTx]);

  if (loading || !session) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (dataQuery.isLoading || !data) return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;

  const remainderMissing = Math.abs(unallocated) > 0.5;

  return (
    <div>
      <PageHeader
        title={monthLabel}
        description={`Day ${dayOfMonth} of ${daysInMonth} · where this month's income is going.`}
      />

      <RecurringPanel />

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
            <Seg amount={expensesOut} total={income} className="bg-primary/70" />
            <Seg amount={reserveOut} total={income} className="bg-warning/60" />
            <Seg amount={fundsOut} total={income} className="bg-success/60" />
            <Seg amount={Math.max(0, unallocated)} total={income} className={remainderMissing ? "bg-destructive/50" : "bg-muted-foreground/20"} />
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Legend swatch="bg-primary/70" label="Expenses" value={formatINR(expensesOut)} />
            <Legend swatch="bg-warning/60" label="Reserves" value={formatINR(reserveOut)} />
            <Legend swatch="bg-success/60" label="Funds" value={formatINR(fundsOut)} />
            <Legend
              swatch={remainderMissing ? "bg-destructive/60" : "bg-muted-foreground/20"}
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
                {formatINR(expensesOut)} / {formatINR(variableLimit)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {categories.map((c) => {
              const spent = spentByCategory[c.id] ?? 0;
              const limit = Number(c.monthly_limit) || 0;
              const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
              const expected = limit * pace;
              const over = spent > limit && limit > 0;
              const ahead = !over && spent > expected * 1.05;
              const under = spent < expected * 0.7;
              const tag = over
                ? { text: `Over by ${formatINR(spent - limit)}`, cls: "text-destructive" }
                : ahead
                  ? { text: "Ahead of pace", cls: "text-warning" }
                  : under
                    ? { text: "Under pace", cls: "text-success" }
                    : { text: "On pace", cls: "text-muted-foreground" };
              return (
                <div key={c.id}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatINR(spent)} / {formatINR(limit)}
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
            {categories.length === 0 ? (
              <div className="text-xs text-muted-foreground">No categories configured yet — add them in Setup.</div>
            ) : null}
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
              const contributed = contribByFund[f.id] ?? 0;
              const target = Number(f.monthly_target) || 0;
              const pct = target > 0 ? Math.min(100, Math.round((contributed / target) * 100)) : 0;
              const remaining = Math.max(0, target - contributed);
              return (
                <div key={f.id}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatINR(contributed)} / {formatINR(target)}
                    </span>
                  </div>
                  <Progress value={pct} />
                  <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {remaining > 0 ? `${formatINR(remaining)} left this month` : "Target met"}
                  </div>
                </div>
              );
            })}
            {funds.length === 0 ? (
              <div className="text-xs text-muted-foreground">No funds configured yet.</div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Where the rest went */}
      <Card className={remainderMissing ? "border-destructive/40" : ""}>
        <CardHeader>
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-base font-medium">Where it went</CardTitle>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatINR(income)} usable income
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            <WaterfallRow label="Income" sub="Salary + net rent this month" amount={income} positive />
            <WaterfallRow
              label="Internal transfers"
              sub={`Between own accounts · gross ${formatINR(transfersGross)} · nets to ₹0`}
              amount={0}
              muted
            />
            <WaterfallRow
              label="Expenses"
              sub={`${monthTx.filter((t) => t.type === "expense").length} expense transactions across all categories`}
              amount={-expensesOut}
            />
            <WaterfallRow
              label="Reserve accruals"
              sub="Earmarked within accounts (e.g. Tax Reserve)"
              amount={-reserveOut}
              muted
            />
            <WaterfallRow
              label="Fund contributions"
              sub="Corpus, Trip and other goal funds"
              amount={-fundsOut}
              muted
            />
            <WaterfallRow
              label="Unallocated remainder"
              sub={remainderMissing ? "Non-zero — reconcile before month end" : "Every rupee of income is accounted for"}
              amount={unallocated}
              bold
              highlight={remainderMissing}
              positive={!remainderMissing}
            />
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Transfers between own accounts net to zero. Fund withdrawals are excluded from this view.
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
  highlight,
}: {
  label: string;
  sub?: string;
  amount: number;
  positive?: boolean;
  muted?: boolean;
  bold?: boolean;
  highlight?: boolean;
}) {
  const tone = highlight
    ? "text-destructive"
    : positive
      ? "text-success"
      : muted
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <li className={"flex items-center justify-between py-3 " + (highlight ? "-mx-6 px-6 bg-destructive/5" : "")}>
      <div className="min-w-0">
        <div className={"text-sm " + (bold ? "font-semibold " : "") + (highlight ? "text-destructive" : "")}>{label}</div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </div>
      <span className={"tabular-nums text-sm " + (bold ? "font-semibold " : "font-medium ") + tone}>
        {formatINR(amount)}
      </span>
    </li>
  );
}
