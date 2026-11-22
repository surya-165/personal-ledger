import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Lock, Minus, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { computeFundBalance, computeReserveBalance, fetchAll, seedIfEmpty, formatINR, type AccountRow, type CategoryRow, type CreditCardPaymentRow, type FundRow, type ReserveRow, type TxRow } from "@/lib/finance-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteCreditCardTransaction } from "@/components/finance/credit-card-payment-dialog";
import { toast } from "sonner";
import { RecurringPanel } from "@/components/finance/recurring-panel";
import { CloseMonthDialog, type BucketFigure } from "@/components/finance/close-month-dialog";
import { fetchClosures, monthKey, lastDayOfMonth } from "@/lib/month-close";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Kanakku Vazhakku" },
      { name: "description", content: "A monthly view of income, spending, savings goals, budgets, and remaining allocations." },
      { property: "og:title", content: "Dashboard — Kanakku Vazhakku" },
      { property: "og:description", content: "A monthly view of income, spending, savings goals, budgets, and remaining allocations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type Level =
  | { name: "l1" }
  | { name: "l2"; bucket: "regular" | "sip" | "funds" | "fixed" | "tax" | "others" }
  | { name: "l3"; bucket: DashboardBucket["key"]; subCategory: string };

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

  const planQuery = useQuery({
    queryKey: ["dashboard-plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [plan, investments, recurring] = await Promise.all([
        supabase.from("budget_plan").select("*").maybeSingle(),
        supabase.from("investments").select("id,name,goal,monthly_amount,active"),
        supabase.from("recurring_templates").select("name,amount"),
      ]);
      const err = plan.error ?? investments.error ?? recurring.error;
      if (err) throw err;
      return {
        plan: plan.data,
        investments: investments.data ?? [],
        recurring: Object.fromEntries((recurring.data ?? []).map((r) => [r.name, Number(r.amount)])),
      };
    },
  });

  const [level, setLevel] = useState<Level>({ name: "l1" });
  const [closeOpen, setCloseOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const today = new Date();
  const curYear = today.getFullYear();
  const curMonth = today.getMonth() + 1;
  const [view, setView] = useState({ year: curYear, month: curMonth });
  const year = view.year;
  const month = view.month;
  const isCurrentMonth = year === curYear && month === curMonth;
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const prevMonth = () => setView((v) => (v.month === 1 ? { year: v.year - 1, month: 12 } : { ...v, month: v.month - 1 }));
  const nextMonth = () => {
    if (isCurrentMonth) return;
    setView((v) => (v.month === 12 ? { year: v.year + 1, month: 1 } : { ...v, month: v.month + 1 }));
  };

  const closuresQuery = useQuery({
    queryKey: ["month-closures", user?.id],
    enabled: !!user,
    queryFn: fetchClosures,
  });
  const closedMonths = useMemo(
    () => new Set((closuresQuery.data ?? []).map((c) => c.month)),
    [closuresQuery.data],
  );
  const thisMonthKey = monthKey(year, month);
  const isClosed = closedMonths.has(thisMonthKey);
  const lastDay = lastDayOfMonth(year, month);
  const lastDayISO = `${year}-${String(month).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  const todayISO = `${curYear}-${String(curMonth).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const data = dataQuery.data;
  const planData = planQuery.data;
  const categories = data?.categories ?? [];
  const funds = data?.funds ?? [];
  const investments = planData?.investments ?? [];
  const monthTx = useMemo(
    () => (data?.transactions ?? []).filter((t) => t.date.startsWith(monthPrefix)),
    [data, monthPrefix],
  );

  // Per-category spend this month (expenses + internal_loan_repayments)
  const spentByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthTx) {
      if ((t.type !== "expense" && t.type !== "internal_loan_repayment") || !t.category_id) continue;
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

  // Bucket totals read the `bucket` column on transactions.
  const bucketTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthTx) {
      const b = t.bucket;
      if (!b) continue;
      m[b] = (m[b] ?? 0) + Number(t.amount);
    }
    return m;
  }, [monthTx]);

  // Split categories: only Car EMI and Flat Maintenance are Fixed Commitments.
  // "Car Maintenance" stays a Regular Expense category.
  const isFixedCat = (name: string) => {
    const n = name.trim().toLowerCase();
    return n === "car emi" || n === "maintenance" || n === "flat maintenance";
  };
  const carEmiCat = categories.find((c) => c.name.trim().toLowerCase() === "car emi");
  const maintenanceCat = categories.find((c) => {
    const n = c.name.trim().toLowerCase();
    return n === "flat maintenance" || n === "maintenance";
  });
  const regularCategories = categories.filter(
    (c) => (c.bucket ? c.bucket === "Regular Expenses" : !isFixedCat(c.name)) && !isFixedCat(c.name),
  );
  const extraFixedCategories = categories.filter(
    (c) => c.bucket === "Fixed Commitments" && !isFixedCat(c.name),
  );
  const maintenanceDueMonths = [1, 4, 7, 10];
  const maintenanceDue = maintenanceDueMonths.includes(month);
  const nextMaintenanceMonth = (() => {
    const next = maintenanceDueMonths.find((m) => m > month) ?? maintenanceDueMonths[0];
    return new Date(2000, next - 1, 1).toLocaleDateString("en-IN", { month: "long" });
  })();

  if (loading || !session) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (dataQuery.isLoading || !data || planQuery.isLoading || !planData) {
    return <div className="text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  // Planned figures — ALL from Setup
  const plannedIncome = Number(planData.plan?.planned_monthly_income ?? 0);
  const plannedRegular = Number(planData.recurring["HDFC→CUB"] ?? 0);
  const activeInvestments = investments.filter((i) => (i as { active?: boolean }).active !== false);
  const plannedSIP = activeInvestments.reduce((s, i) => s + Number(i.monthly_amount ?? 0), 0);
  const plannedFundsTotal =
    Number(planData.plan?.planned_corpus_contribution ?? 0) +
    Number(planData.plan?.planned_trip_contribution ?? 0);
  const plannedCarEmi = Number(planData.plan?.planned_car_emi ?? 0);
  const plannedMaintenanceRaw = Number(planData.plan?.planned_maintenance ?? 0);
  const plannedMaintenance = maintenanceDue ? plannedMaintenanceRaw : 0;
  const plannedExtraFixed = extraFixedCategories.reduce((s, c) => s + Number(c.monthly_limit ?? 0), 0);
  const plannedFixed = plannedCarEmi + plannedMaintenance + plannedExtraFixed;
  const plannedTax = Number(planData.plan?.planned_tax_reserve ?? 0);

  // Actuals this month — grouped by the transaction's bucket column
  const actualRegular = bucketTotals["Regular Expenses"] ?? 0;
  const actualFixed = bucketTotals["Fixed Commitments"] ?? 0;
  const actualFunds = bucketTotals["Fund Contributions"] ?? 0;
  const actualTax = bucketTotals["Tax Reserve"] ?? 0;
  const actualSIP = bucketTotals["SIP Investments"] ?? 0;
  const actualOthers = bucketTotals["Others"] ?? 0;
  // SIP actuals per fund — matched on the Level 2 sub-category, falling back to
  // the description for transactions logged before sub-categories existed.
  const actualSIPByInvestment: Record<string, number> = {};
  for (const inv of investments) {
    const needle = inv.name.toLowerCase();
    actualSIPByInvestment[inv.id] = monthTx
      .filter((t) =>
        t.bucket === "SIP Investments"
          ? (t.sub_category ?? "") === inv.name
          : (t.type === "expense" || t.type === "transfer") && (t.description ?? "").toLowerCase().includes(needle),
      )
      .reduce((s, t) => s + Number(t.amount), 0);
  }

  const totalAllocated = actualRegular + actualSIP + actualFunds + actualFixed + actualTax + actualOthers;
  const totalPlannedBuckets = plannedRegular + plannedSIP + plannedFundsTotal + plannedFixed + plannedTax;
  const plannedUnallocated = plannedIncome - totalPlannedBuckets;
  const unallocated = plannedIncome - totalAllocated;
  const remainderMissing = Math.abs(unallocated) > 0.5;

  // Close-month availability: on/after last day, not already closed, month has transactions.
  const hasTransactions = monthTx.length > 0;
  const canClose = !isClosed && hasTransactions && todayISO >= lastDayISO;

  const closeFigures: BucketFigure[] = [
    { bucket: "Regular Expenses", planned: plannedRegular, actual: actualRegular },
    { bucket: "SIP Investments", planned: plannedSIP, actual: actualSIP },
    { bucket: "Fund Contributions", planned: plannedFundsTotal, actual: actualFunds },
    { bucket: "Fixed Commitments", planned: plannedFixed, actual: actualFixed },
    { bucket: "Tax Reserve", planned: plannedTax, actual: actualTax },
    { bucket: "Others", planned: 0, actual: actualOthers },
  ];

  const daysInMonth = lastDay.getDate();
  const elapsedDays = today.getDate();
  const daysRemaining = daysInMonth - elapsedDays + 1;
  const actualIncome = monthTx
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const previousMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const previousMonthPrefix = `${previousMonth.year}-${String(previousMonth.month).padStart(2, "0")}`;
  const previousMonthTx = (data.transactions ?? []).filter((t) => t.date.startsWith(previousMonthPrefix));
  const previousBucketTotals: Record<string, number> = {};
  for (const t of previousMonthTx) {
    if (t.bucket) previousBucketTotals[t.bucket] = (previousBucketTotals[t.bucket] ?? 0) + Number(t.amount);
  }
  const creditCardOutstanding = (data.transactions ?? [])
    .filter((t) => t.is_credit_card && t.credit_card_payment_status !== "paid")
    .reduce((sum, t) => sum + Math.max(0, Number(t.amount) - Number(t.credit_card_paid_amount ?? 0)), 0);
  const projectedRegular = elapsedDays > 0 ? (actualRegular / elapsedDays) * daysInMonth : 0;
  const dailyAllowance = daysRemaining > 0 ? (plannedRegular - actualRegular) / daysRemaining : 0;
  const bucketRows: DashboardBucket[] = [
    { key: "regular", label: "Regular Expenses", actual: actualRegular, planned: plannedRegular },
    { key: "sip", label: "SIP Investments", actual: actualSIP, planned: plannedSIP },
    { key: "funds", label: "Fund Contributions", actual: actualFunds, planned: plannedFundsTotal },
    { key: "fixed", label: "Fixed Commitments", actual: actualFixed, planned: plannedFixed },
    { key: "tax", label: "Tax Reserve", actual: actualTax, planned: plannedTax },
    { key: "others", label: "Others", actual: actualOthers, planned: 0 },
  ];

  const expectedItems: ExpectedItem[] = [];
  if (isCurrentMonth) {
    const regularRemaining = Math.max(0, plannedRegular - actualRegular);
    if (regularRemaining > 0) expectedItems.push({ label: "Regular Expenses allocation", amount: regularRemaining, bucket: "regular" });
    for (const investment of activeInvestments) {
      const remaining = Math.max(0, Number(investment.monthly_amount ?? 0) - (actualSIPByInvestment[investment.id] ?? 0));
      if (remaining > 0) expectedItems.push({ label: investment.name, amount: remaining, bucket: "sip" });
    }
    for (const fund of funds) {
      const target = fund.code === "corpus"
        ? Number(planData.plan?.planned_corpus_contribution ?? 0)
        : fund.code === "trip"
          ? Number(planData.plan?.planned_trip_contribution ?? 0)
          : Number(fund.monthly_target ?? 0);
      const remaining = Math.max(0, target - (contribByFund[fund.id] ?? 0));
      if (remaining > 0) expectedItems.push({ label: fund.name, amount: remaining, bucket: "funds" });
    }
    const fixedExpected = [
      { label: "Car EMI", amount: Math.max(0, plannedCarEmi - (carEmiCat ? spentByCategory[carEmiCat.id] ?? 0 : 0)), bucket: "fixed" as const },
      ...(maintenanceDue ? [{ label: "Flat Maintenance", amount: Math.max(0, plannedMaintenance - (maintenanceCat ? spentByCategory[maintenanceCat.id] ?? 0 : 0)), bucket: "fixed" as const }] : []),
      ...extraFixedCategories.map((category) => ({
        label: category.name,
        amount: Math.max(0, Number(category.monthly_limit ?? 0) - (spentByCategory[category.id] ?? 0)),
        bucket: "fixed" as const,
      })),
    ];
    expectedItems.push(...fixedExpected.filter((item) => item.amount > 0));
    if (plannedTax > actualTax) expectedItems.push({ label: "Tax Reserve", amount: plannedTax - actualTax, bucket: "tax" });
  }
  const stillExpected = expectedItems.reduce((sum, item) => sum + item.amount, 0);
  const trulyUnallocated = unallocated - stillExpected;
  const significantRemainder = isCurrentMonth && plannedIncome > 0 && Math.abs(trulyUnallocated) >= plannedIncome * 0.05;

  const categoryInsights = categories.flatMap((category) => {
    const spent = spentByCategory[category.id] ?? 0;
    const limit = Number(category.monthly_limit ?? 0);
    const categoryBucket = category.bucket === "Fixed Commitments" ? "fixed" as const : "regular" as const;
    const target: Level = { name: "l3", bucket: categoryBucket, subCategory: category.name };
    const items: InsightItem[] = [];
    if (isCurrentMonth && limit > 0 && spent / limit >= 0.75 && daysInMonth - elapsedDays + 1 > daysInMonth / 3) {
      items.push({
        title: `${category.name} has used ${Math.round((spent / limit) * 100)}% of its limit`,
        detail: `${formatINR(spent)} of ${formatINR(limit)} with more than a third of the month remaining.`,
        tone: "warning", target, priority: 1,
      });
    }
    if (isCurrentMonth) {
      let priorTotal = 0;
      for (let offset = 1; offset <= 3; offset += 1) {
        const date = new Date(year, month - 1 - offset, 1);
        const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        priorTotal += (data.transactions ?? [])
          .filter((t) => t.date.startsWith(prefix) && t.category_id === category.id && (t.type === "expense" || t.type === "internal_loan_repayment"))
          .reduce((sum, t) => sum + Number(t.amount), 0);
      }
      const average = priorTotal / 3;
      if (average > 0 && spent > average * 1.3) {
        items.push({
          title: `${category.name} is above its recent average`,
          detail: `${formatINR(spent)} so far, versus a three-month average of ${formatINR(average)}.`,
          tone: "neutral", target, priority: 3,
        });
      }
    }
    return items;
  });

  const insights: InsightItem[] = isCurrentMonth
    ? [
        {
          title: projectedRegular > plannedRegular ? "Regular spending is projected over budget" : "Regular spending is within its monthly plan",
          detail: `At this pace, regular expenses are projected at ${formatINR(projectedRegular)} against ${formatINR(plannedRegular)} planned.`,
          tone: projectedRegular > plannedRegular ? "warning" : "positive", target: { name: "l2", bucket: "regular" }, priority: projectedRegular > plannedRegular ? 0 : 4,
        },
        ...categoryInsights,
        {
          title: actualOthers > 0 ? "Unbudgeted spending has been recorded" : "No unbudgeted spending recorded",
          detail: actualOthers > 0
            ? `${formatINR(actualOthers)} in Others${previousBucketTotals.Others !== undefined ? `, compared with ${formatINR(previousBucketTotals.Others)} last month` : ""}.`
            : "Others has no planned amount and is currently at zero.",
          tone: actualOthers > 0 ? "neutral" : "positive", target: { name: "l2", bucket: "others" }, priority: actualOthers > 0 ? 2 : 5,
        },
        {
          title: stillExpected > 0 ? `${expectedItems.length} planned items are still expected` : "All planned bucket items are logged",
          detail: stillExpected > 0 ? `${formatINR(stillExpected)} remains across planned SIPs, funds, fixed items, and tax reserve.` : "No remaining planned bucket allocations were found.",
          tone: stillExpected > 0 ? "neutral" : "positive", target: { name: "l2", bucket: "funds" }, priority: stillExpected > 0 ? 3 : 5,
        },
        ...(creditCardOutstanding > 0 ? [{
          title: "Credit card balance is still outstanding",
          detail: `${formatINR(creditCardOutstanding)} remains unpaid across card transactions.`,
          tone: "warning" as const, target: { name: "l2" as const, bucket: "others" as const }, priority: 1,
        }] : []),
      ]
    : [
        {
          title: `${monthLabel} closed ${unallocated >= 0 ? "with money unallocated" : "over planned income"}`,
          detail: `Final unallocated amount: ${formatINR(unallocated)}.`,
          tone: unallocated < 0 ? "warning" : "neutral", target: { name: "l1" }, priority: 0,
        },
        {
          title: actualOthers > 0 ? "Unbudgeted spending was recorded" : "No unbudgeted spending was recorded",
          detail: `${formatINR(actualOthers)} in Others, versus ${formatINR(previousBucketTotals.Others ?? 0)} in the prior month.`,
          tone: actualOthers > 0 ? "neutral" : "positive", target: { name: "l2", bucket: "others" }, priority: 2,
        },
        {
          title: actualRegular <= plannedRegular ? "Regular Expenses stayed within plan" : "Regular Expenses exceeded plan",
          detail: `${formatINR(actualRegular)} actual against ${formatINR(plannedRegular)} planned.`,
          tone: actualRegular > plannedRegular ? "warning" : "positive", target: { name: "l2", bucket: "regular" }, priority: actualRegular > plannedRegular ? 1 : 3,
        },
      ];
  const visibleInsights = insights.sort((a, b) => a.priority - b.priority).slice(0, 5);

  const go = (l: Level) => setLevel(l);

  return (
    <div
      className="space-y-6"
      onTouchStart={(event) => { touchStart.current = { x: event.changedTouches[0]?.clientX ?? 0, y: event.changedTouches[0]?.clientY ?? 0 }; }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        const end = event.changedTouches[0];
        if (!start || !end) return;
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx > 0) prevMonth();
          else nextMonth();
        }
      }}
    >
      <section className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 text-center">
            <h1 className="text-xl font-semibold">{monthLabel}</h1>
            {isCurrentMonth ? <p className="mt-0.5 text-sm text-muted-foreground">Day {elapsedDays} of {daysInMonth}</p> : null}
          </div>
          {isClosed ? <span className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-sm bg-success/10 px-2 py-1 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Closed ✓</span> : null}
          <Button variant="ghost" size="icon" onClick={nextMonth} disabled={isCurrentMonth} aria-label="Next month">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        {canClose ? <Button variant="outline" onClick={() => setCloseOpen(true)}><Lock className="mr-2 h-4 w-4" />Close month</Button> : null}
      </section>

      {!isCurrentMonth ? <div className="rounded-sm border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">Viewing {monthLabel} — read only</div> : null}

      {isCurrentMonth && level.name === "l1" ? <RecurringPanel /> : null}

      {level.name === "l1" ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          <section aria-label="Monthly summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Income this month" value={formatINR(actualIncome)} detail={`Planned ${formatINR(plannedIncome)}`} />
            <StatCard label="Spent so far" value={formatINR(totalAllocated)} detail="All six buckets, including Others" />
            {isCurrentMonth ? (
              <>
                <StatCard label="Daily allowance left" value={formatINR(dailyAllowance)} detail={`${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`} warning={dailyAllowance < 0} />
                <StatCard label="Projected month-end" value={formatINR(projectedRegular)} detail={`${projectedRegular > plannedRegular ? "Over" : "Within"} Regular Expenses plan · ${formatINR(plannedRegular)}`} warning={projectedRegular > plannedRegular} />
              </>
            ) : (
              <>
                <StatCard label="Regular Expenses" value={formatINR(actualRegular)} detail={`Final actual · ${formatINR(plannedRegular)} planned`} warning={actualRegular > plannedRegular} />
                <StatCard label="Unallocated" value={formatINR(unallocated)} detail="Final month figure" warning={unallocated < 0} />
              </>
            )}
          </section>

          <InsightsPanel insights={visibleInsights} onSelect={go} />

          <AllocationOverview rows={bucketRows} plannedIncome={plannedIncome} onSelect={(key) => go({ name: "l2", bucket: key })} />

          <ExpectedSummary
            items={expectedItems}
            total={stillExpected}
            remainder={isCurrentMonth ? trulyUnallocated : unallocated}
            isCurrentMonth={isCurrentMonth}
            significant={significantRemainder}
            onSelect={(bucket) => go({ name: "l2", bucket })}
          />

          <section aria-labelledby="bucket-cards-heading">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 id="bucket-cards-heading" className="text-lg font-semibold">Buckets</h2>
                <p className="text-sm text-muted-foreground">Planned allocations and actual spending</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {bucketRows.map((row) => (
                <BucketSummaryCard
                  key={row.key}
                  row={row}
                  previousActual={previousBucketTotals[row.label] ?? 0}
                  day={elapsedDays}
                  days={daysInMonth}
                  showPacing={isCurrentMonth && row.key !== "others"}
                  onClick={() => go({ name: "l2", bucket: row.key })}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      <div key={level.name + ("bucket" in level ? level.bucket : "") + ("subCategory" in level ? level.subCategory : "") + monthPrefix}
           className={level.name === "l1" ? "hidden" : "animate-in fade-in slide-in-from-right-2 duration-200"}>
        {level.name === "l2" ? (
          <BucketDetailView
            bucket={level.bucket}
            label={bucketRows.find((row) => row.key === level.bucket)?.label ?? "Bucket"}
            monthTx={monthTx}
            allTransactions={data.transactions}
            payments={data.creditCardPayments}
            accounts={[...data.accounts, ...(data.creditCardAccount ? [data.creditCardAccount] : [])]}
            categories={categories}
            funds={funds}
            reserves={data.reserves}
            investments={investments}
            plannedRegular={plannedRegular}
            plannedSIP={plannedSIP}
            plannedFunds={plannedFundsTotal}
            plannedFixed={plannedFixed}
            plannedTax={plannedTax}
            plannedCarEmi={plannedCarEmi}
            plannedMaintenance={plannedMaintenance}
            plannedCorpus={Number(planData.plan?.planned_corpus_contribution ?? 0)}
            plannedTrip={Number(planData.plan?.planned_trip_contribution ?? 0)}
            maintenanceDue={maintenanceDue}
            nextMaintenanceMonth={nextMaintenanceMonth}
            year={year}
            month={month}
            day={elapsedDays}
            isCurrentMonth={isCurrentMonth}
            isClosed={isClosed}
            userId={user!.id}
            onBack={() => go({ name: "l1" })}
            onSelectSubCategory={(subCategory) => go({ name: "l3", bucket: level.bucket, subCategory })}
            onRefresh={() => dataQuery.refetch()}
          />
        ) : level.name === "l3" ? (
          <SubcategoryDetailView
            bucket={level.bucket}
            subCategory={level.subCategory}
            monthTx={monthTx}
            allTransactions={data.transactions}
            payments={data.creditCardPayments}
            accounts={[...data.accounts, ...(data.creditCardAccount ? [data.creditCardAccount] : [])]}
            categories={categories}
            funds={funds}
            reserves={data.reserves}
            investments={investments}
            plannedRegular={plannedRegular}
            plannedSIP={plannedSIP}
            plannedFunds={plannedFundsTotal}
            plannedFixed={plannedFixed}
            plannedTax={plannedTax}
            plannedCarEmi={plannedCarEmi}
            plannedMaintenance={plannedMaintenance}
            plannedCorpus={Number(planData.plan?.planned_corpus_contribution ?? 0)}
            plannedTrip={Number(planData.plan?.planned_trip_contribution ?? 0)}
            maintenanceDue={maintenanceDue}
            nextMaintenanceMonth={nextMaintenanceMonth}
            year={year}
            month={month}
            day={elapsedDays}
            isCurrentMonth={isCurrentMonth}
            isClosed={isClosed}
            userId={user!.id}
            onBack={() => go({ name: "l2", bucket: level.bucket })}
            onRefresh={() => dataQuery.refetch()}
          />
        ) : null}
      </div>

      <CloseMonthDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        userId={user!.id}
        month={thisMonthKey}
        monthLabel={monthLabel}
        lastDay={lastDayISO}
        figures={closeFigures}
        accounts={data.accounts}
      />
    </div>
  );
}

interface DashboardBucket {
  key: "regular" | "sip" | "funds" | "fixed" | "tax" | "others";
  label: string;
  actual: number;
  planned: number;
}

interface ExpectedItem {
  label: string;
  amount: number;
  bucket: DashboardBucket["key"];
}

interface InsightItem {
  title: string;
  detail: string;
  tone: "warning" | "positive" | "neutral";
  target: Level;
  priority: number;
}

function StatCard({ label, value, detail, warning = false }: { label: string; value: string; detail: string; warning?: boolean }) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-4 sm:p-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={"mt-2 break-words text-2xl font-semibold tabular-nums " + (warning ? "text-destructive" : "")}>{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function InsightsPanel({ insights, onSelect }: { insights: InsightItem[]; onSelect: (level: Level) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" />Insights</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {insights.map((insight, index) => (
          <Button
            key={`${insight.title}-${index}`}
            variant="ghost"
            onClick={() => onSelect(insight.target)}
            className="h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-none px-1 py-3 text-left"
            title={`${insight.title}. ${insight.detail}`}
          >
            {insight.tone === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> : insight.tone === "positive" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{insight.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{insight.detail}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function AllocationOverview({ rows, plannedIncome, onSelect }: { rows: DashboardBucket[]; plannedIncome: number; onSelect: (key: DashboardBucket["key"]) => void }) {
  const scale = Math.max(1, plannedIncome, ...rows.map((row) => Math.max(row.planned, row.actual)));
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle className="text-base">Allocation overview</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Planned and actual amounts across monthly income</p>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />Planned</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chart-2" />Actual</span></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((row) => (
          <Button key={row.key} variant="ghost" onClick={() => onSelect(row.key)} className="h-auto min-h-[4.5rem] w-full justify-start rounded-sm px-2 py-2 text-left" title={`${row.label}: ${formatINR(row.actual)} actual, ${row.planned > 0 ? `${formatINR(row.planned)} planned` : "unbudgeted"}`}>
            <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(8rem,0.9fr)_minmax(0,2fr)_auto]">
              <span className="truncate text-sm font-medium">{row.label}{row.key === "others" ? <span className="ml-1 text-xs font-normal text-muted-foreground">· Unbudgeted</span> : null}</span>
              <span className="col-span-2 grid gap-1.5 sm:col-span-1">
                <span className="flex h-1.5 overflow-hidden rounded-full bg-muted"><span className="rounded-full bg-primary" style={{ width: `${Math.min(100, (row.planned / scale) * 100)}%` }} /></span>
                <span className="flex h-1.5 overflow-hidden rounded-full bg-muted"><span className="rounded-full bg-chart-2" style={{ width: `${Math.min(100, (row.actual / scale) * 100)}%` }} /></span>
              </span>
              <span className="row-span-2 text-right text-xs tabular-nums text-muted-foreground sm:row-span-1">{formatINR(row.actual)}{row.planned > 0 ? <span className="block sm:inline"> / {formatINR(row.planned)}</span> : null}</span>
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function ExpectedSummary({ items, total, remainder, isCurrentMonth, significant, onSelect }: { items: ExpectedItem[]; total: number; remainder: number; isCurrentMonth: boolean; significant: boolean; onSelect: (bucket: DashboardBucket["key"]) => void }) {
  return (
    <Card>
      <CardContent className="grid gap-5 p-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)] sm:p-5">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{isCurrentMonth ? "Still expected this month" : "Final unallocated"}</div>
          {isCurrentMonth ? (
            <>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(total)}</div>
              <div className="mt-3 divide-y divide-border">
                {items.length ? items.map((item) => (
                  <Button key={`${item.bucket}-${item.label}`} variant="ghost" onClick={() => onSelect(item.bucket)} className="h-auto min-h-10 w-full justify-between gap-3 rounded-none px-1 py-2 text-left">
                    <span className="truncate text-sm">{item.label}</span><span className="shrink-0 text-sm tabular-nums">{formatINR(item.amount)}</span>
                  </Button>
                )) : <p className="py-2 text-sm text-muted-foreground">No planned bucket items remain unlogged.</p>}
              </div>
            </>
          ) : <p className="mt-1 text-sm text-muted-foreground">Past months show the final remainder only.</p>}
        </div>
        <div className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div className="flex items-center gap-2 text-sm font-semibold">{significant ? <AlertTriangle className="h-4 w-4 text-warning" /> : null}{isCurrentMonth ? "Truly unallocated" : "Unallocated"}</div>
          <div className={"mt-2 text-2xl font-semibold tabular-nums " + (significant ? "text-warning" : "")}>{formatINR(remainder)}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{isCurrentMonth ? "Planned income less recorded and still-expected allocations." : "Planned income less the month's recorded allocations."}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function BucketSummaryCard({ row, previousActual, day, days, showPacing, onClick }: { row: DashboardBucket; previousActual: number; day: number; days: number; showPacing: boolean; onClick: () => void }) {
  const difference = row.actual - previousActual;
  const isOthers = row.key === "others";
  const aheadOfPace = row.planned > 0 && showPacing && row.actual > (row.planned * day / days) * 1.1 && row.actual <= row.planned;
  const overPace = row.planned > 0 && row.actual > row.planned;
  const status = overPace ? "Over pace" : aheadOfPace ? "Ahead of pace" : "On track";
  return (
    <Button variant="outline" onClick={onClick} className="h-auto min-h-40 w-full flex-col items-stretch justify-start gap-3 whitespace-normal p-4 text-left transition-colors hover:border-primary">
      <span className="flex w-full min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{row.label}</span>
          {isOthers ? <span className="mt-0.5 block text-xs text-muted-foreground">Unbudgeted spend</span> : null}
        </span>
        {showPacing && !isOthers ? <span className={"shrink-0 text-xs font-medium " + (overPace ? "text-destructive" : aheadOfPace ? "text-warning" : "text-success")}>{status}</span> : null}
      </span>
      <span className="w-full">
        <span className="block text-xl font-semibold tabular-nums">{formatINR(row.actual)}{row.planned > 0 ? <span className="text-sm font-normal text-muted-foreground"> / {formatINR(row.planned)}</span> : null}</span>
        {!isOthers && row.planned > 0 ? <PaceProgress actual={row.actual} planned={row.planned} day={day} days={days} showMarker={showPacing} /> : null}
      </span>
      <span className="mt-auto flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          {difference > 0 ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0" /> : difference < 0 ? <ArrowDownRight className="h-3.5 w-3.5 shrink-0" /> : <Minus className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{formatINR(Math.abs(difference))} {difference === 0 ? "unchanged" : difference > 0 ? "more" : "less"} vs last month</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0" />
      </span>
    </Button>
  );
}

function PaceProgress({ actual, planned, day, days, showMarker }: { actual: number; planned: number; day: number; days: number; showMarker: boolean }) {
  const fill = planned > 0 ? Math.min(100, Math.max(0, (actual / planned) * 100)) : 0;
  const marker = days > 0 ? Math.min(100, Math.max(0, (day / days) * 100)) : 0;
  return (
    <span className="relative mt-3 block h-2 rounded-full bg-muted" aria-label={`Progress ${Math.round(fill)} percent${showMarker ? `; today marker at ${Math.round(marker)} percent` : ""}`}>
      <span className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all" style={{ width: `${fill}%` }} />
      {showMarker ? <span className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${marker}%` }} /> : null}
    </span>
  );
}

function Level2Tax({ transactions, actual, planned, onBack }: { transactions: Array<{ id: string; date: string; description: string; amount: number }>; actual: number; planned: number; onBack: () => void }) {
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <BackBar label="Tax Reserve" onBack={onBack} />
      <SummaryStrip label="Tax Reserve" actual={actual} planned={planned} />
      <Card className="mt-4">
        <CardContent className="pt-4">
          {sorted.length ? <ul className="divide-y divide-border">{sorted.map((transaction) => <li key={transaction.id} className="flex items-center justify-between gap-4 py-3"><span className="min-w-0"><span className="block text-sm font-medium">{transaction.description || "Tax reserve accrual"}</span><span className="text-xs text-muted-foreground">{formatDate(transaction.date)}</span></span><span className="shrink-0 text-sm font-medium tabular-nums">{formatINR(transaction.amount)}</span></li>)}</ul> : <p className="py-5 text-sm text-muted-foreground">No Tax Reserve transactions this month.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

type DetailBucket = DashboardBucket["key"];
interface DashboardInvestment { id: string; name: string; goal: string | null; monthly_amount: number; active: boolean }
interface DetailSubCategory { name: string; planned: number; categoryId?: string; fundId?: string; investmentId?: string; note?: string; muted?: boolean }
interface DetailProps {
  bucket: DetailBucket;
  monthTx: TxRow[];
  allTransactions: TxRow[];
  payments: CreditCardPaymentRow[];
  accounts: AccountRow[];
  categories: CategoryRow[];
  funds: FundRow[];
  reserves: ReserveRow[];
  investments: DashboardInvestment[];
  plannedRegular: number;
  plannedSIP: number;
  plannedFunds: number;
  plannedFixed: number;
  plannedTax: number;
  plannedCarEmi: number;
  plannedMaintenance: number;
  plannedCorpus: number;
  plannedTrip: number;
  maintenanceDue: boolean;
  nextMaintenanceMonth: string;
  year: number;
  month: number;
  day: number;
  isCurrentMonth: boolean;
  isClosed: boolean;
  userId: string;
  onRefresh: () => void;
}

function bucketLabelFor(key: DetailBucket) {
  return ({ regular: "Regular Expenses", sip: "SIP Investments", funds: "Fund Contributions", fixed: "Fixed Commitments", tax: "Tax Reserve", others: "Others" })[key];
}

function subcategoryName(tx: TxRow, categories: CategoryRow[], funds: FundRow[], reserves: ReserveRow[]) {
  if (tx.sub_category) return tx.sub_category;
  if (tx.category_id) return categories.find((c) => c.id === tx.category_id)?.name ?? "Uncategorised";
  if (tx.fund_id) return funds.find((f) => f.id === tx.fund_id)?.name ?? "Fund";
  if (tx.reserve_id) return reserves.find((r) => r.id === tx.reserve_id)?.name ?? "Reserve";
  return "Uncategorised";
}

function buildSubCategories(props: DetailProps): DetailSubCategory[] {
  const { bucket, categories, funds, investments, plannedCarEmi, plannedMaintenance, plannedCorpus, plannedTrip, plannedTax, maintenanceDue, nextMaintenanceMonth, monthTx } = props;
  if (bucket === "regular") {
    return categories
      .filter((c) => c.bucket === "Regular Expenses" || (!c.bucket && !isFixedName(c.name)))
      .map((c) => ({ name: c.name, planned: Number(c.monthly_limit ?? 0), categoryId: c.id }));
  }
  if (bucket === "sip") return investments.map((i) => ({ name: i.name, planned: i.active === false ? 0 : Number(i.monthly_amount ?? 0), investmentId: i.id, note: i.goal || "Unassigned", muted: i.active === false }));
  if (bucket === "funds") return funds.map((f) => ({ name: f.name, planned: f.code === "corpus" ? plannedCorpus : f.code === "trip" ? plannedTrip : Number(f.monthly_target ?? 0), fundId: f.id }));
  if (bucket === "fixed") {
    const car = categories.find((c) => c.name.trim().toLowerCase() === "car emi");
    const maintenance = categories.find((c) => ["maintenance", "flat maintenance"].includes(c.name.trim().toLowerCase()));
    const extras = categories.filter((c) => c.bucket === "Fixed Commitments" && !isFixedName(c.name));
    return [
      { name: car?.name ?? "Car EMI", planned: plannedCarEmi, ...(car ? { categoryId: car.id } : {}), note: "Monthly commitment" },
      { name: maintenance?.name ?? "Flat Maintenance", planned: plannedMaintenance, ...(maintenance ? { categoryId: maintenance.id } : {}), note: maintenanceDue ? "Quarterly · due this month" : `Not due this month · Next due: ${nextMaintenanceMonth}`, muted: !maintenanceDue },
      ...extras.map((c) => ({ name: c.name, planned: Number(c.monthly_limit ?? 0), categoryId: c.id, note: "Monthly commitment" })),
    ];
  }
  if (bucket === "tax") return [{ name: "Tax Reserve", planned: plannedTax }];
  const others = [...new Set(monthTx.filter((t) => t.bucket === "Others").map((t) => subcategoryName(t, categories, funds, props.reserves)))];
  return others.map((name) => ({ name, planned: 0 }));
}

function isFixedName(name: string) {
  return ["car emi", "maintenance", "flat maintenance"].includes(name.trim().toLowerCase());
}

function matchingSubcategory(tx: TxRow, item: DetailSubCategory, categories: CategoryRow[], funds: FundRow[], reserves: ReserveRow[]) {
  return item.categoryId ? tx.category_id === item.categoryId || subcategoryName(tx, categories, funds, reserves) === item.name
    : item.fundId ? tx.fund_id === item.fundId || subcategoryName(tx, categories, funds, reserves) === item.name
      : subcategoryName(tx, categories, funds, reserves) === item.name;
}

function accountFilterPills(accounts: AccountRow[], available: AccountRow[], selected: string[], setSelected: (ids: string[]) => void) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter by account">
      {available.map((account) => {
        const active = selected.includes(account.id);
        return <Button key={account.id} type="button" size="sm" variant={active ? "secondary" : "outline"} aria-pressed={active} onClick={() => {
          if (active && selected.length <= 1) return;
          setSelected(active ? selected.filter((id) => id !== account.id) : [...selected, account.id]);
        }}>{accounts.find((a) => a.id === account.id)?.name ?? account.name}</Button>;
      })}
    </div>
  );
}

function makeDailyTrend(transactions: TxRow[], year: number, month: number, planned: number) {
  const days = new Date(year, month, 0).getDate();
  const byDay: Record<number, number> = {};
  for (const tx of transactions) {
    const date = Number(tx.date.slice(8, 10));
    byDay[date] = (byDay[date] ?? 0) + Number(tx.amount);
  }
  let cumulative = 0;
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    cumulative += byDay[day] ?? 0;
    return { day, actual: cumulative, ideal: planned * day / days, daily: byDay[day] ?? 0 };
  });
}

function selectedSubcategoryActual(transactions: TxRow[], item: DetailSubCategory, categories: CategoryRow[], funds: FundRow[], reserves: ReserveRow[]) {
  return transactions.filter((tx) => matchingSubcategory(tx, item, categories, funds, reserves)).reduce((sum, tx) => sum + Number(tx.amount), 0);
}

function BucketDetailView(props: DetailProps & { label: string; onBack: () => void; onSelectSubCategory: (name: string) => void }) {
  const { bucket, label, monthTx, allTransactions, accounts, categories, funds, reserves, investments, year, month, day, isCurrentMonth, isClosed, onBack, onSelectSubCategory } = props;
  const items = useMemo(() => buildSubCategories(props), [props]);
  const bucketLabel = bucketLabelFor(bucket);
  const bucketTx = monthTx.filter((t) => t.bucket === bucketLabel);
  const availableAccounts = accounts.filter((account) => bucketTx.some((t) => t.account_id === account.id));
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const accountSignature = availableAccounts.map((a) => a.id).join("|");
  const categorySignature = items.map((i) => i.name).join("|");
  useEffect(() => setSelectedAccounts(availableAccounts.map((a) => a.id)), [accountSignature]);
  useEffect(() => setSelectedCategories(items.map((i) => i.name)), [categorySignature]);
  const accountSet = new Set(selectedAccounts);
  const categorySet = new Set(selectedCategories);
  const filtered = bucketTx.filter((tx) => accountSet.has(tx.account_id) && categorySet.has(subcategoryName(tx, categories, funds, reserves)));
  const selectedItems = items.filter((item) => categorySet.has(item.name));
  const planned = bucket === "others" ? 0 : selectedItems.reduce((sum, item) => sum + item.planned, 0);
  const actual = filtered.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const currentTrend = makeDailyTrend(filtered, year, month, planned);
  const dayCount = new Date(year, month, 0).getDate();
  const comparisonRows = selectedItems.map((item) => {
    const values = [];
    for (let offset = 0; offset <= 3; offset++) {
      const d = new Date(year, month - 1 - offset, 1);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const txs = allTransactions.filter((tx) => tx.date.startsWith(prefix) && tx.bucket === bucketLabel && accountSet.has(tx.account_id));
      values.push(selectedSubcategoryActual(txs, item, categories, funds, reserves));
    }
    return { name: item.name, current: values[0] ?? 0, last: values[1] ?? 0, average: (values[1] + values[2] + values[3]) / 3 };
  }).sort((a, b) => b.current - a.current);
  const spendByAccount = availableAccounts.map((account) => ({ name: account.name, amount: filtered.filter((t) => t.account_id === account.id).reduce((sum, t) => sum + Number(t.amount), 0) })).filter((a) => a.amount > 0);
  const spendByCategory = selectedItems.map((item) => ({ name: item.name, amount: selectedSubcategoryActual(filtered, item, categories, funds, reserves), planned: item.planned })).sort((a, b) => b.amount - a.amount);
  const topTransactions = [...filtered].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
  const editable = isCurrentMonth && !isClosed;
  const pacing = planned > 0 ? actual > planned ? "Over pace" : actual > planned * day / dayCount * 1.1 ? "Ahead of pace" : "On track" : "Unbudgeted spend";
  const taxReserve = reserves.find((r) => r.name.toLowerCase().includes("tax"));

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
      <BackBar label={label} onBack={onBack} />
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-2xl font-semibold">{label}</h2><p className="mt-1 text-sm text-muted-foreground">{isCurrentMonth ? `Day ${day} of ${dayCount}` : "Read-only month view"}</p></div>
        <div className="text-right"><div className="text-2xl font-semibold tabular-nums">{formatINR(actual)}{bucket !== "others" ? <span className="text-base font-normal text-muted-foreground"> / {formatINR(planned)}</span> : null}</div><p className={"mt-1 text-sm " + (pacing === "Over pace" ? "text-destructive" : pacing === "Ahead of pace" ? "text-warning" : "text-muted-foreground")}>{pacing}</p></div>
      </section>
      {bucket !== "others" && planned > 0 ? <PaceProgress actual={actual} planned={planned} day={day} days={dayCount} showMarker={isCurrentMonth} /> : null}

      <Card><CardContent className="space-y-4 p-4">
        <div><div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Accounts</div>{availableAccounts.length ? accountFilterPills(accounts, availableAccounts, selectedAccounts, setSelectedAccounts) : <p className="text-sm text-muted-foreground">No transactions for this bucket in the selected month.</p>}</div>
        <div><div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Sub-categories</div><div className="flex gap-2 overflow-x-auto pb-1">{items.map((item) => {
          const active = categorySet.has(item.name);
          return <Button key={item.name} size="sm" variant={active ? "secondary" : "outline"} aria-pressed={active} onClick={() => setSelectedCategories(active ? selectedCategories.filter((name) => name !== item.name) : [...selectedCategories, item.name])}>{item.name}</Button>;
        })}</div></div>
      </CardContent></Card>

      {bucket === "funds" ? <FundOverview items={selectedItems} funds={funds} transactions={allTransactions} monthTx={filtered} onSelect={onSelectSubCategory} /> : null}
      {bucket === "sip" ? <SipOverview items={selectedItems} monthTx={filtered} categories={categories} funds={funds} reserves={reserves} onSelect={onSelectSubCategory} /> : null}
      {bucket === "fixed" ? <FixedOverview items={selectedItems} onSelect={onSelectSubCategory} /> : null}
      {bucket === "tax" ? <TaxOverview reserve={taxReserve} transactions={allTransactions} actual={actual} planned={props.plannedTax} /> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <DetailChart title="Spend by account" empty="No spending for the selected accounts." noData={spendByAccount.length === 0}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={spendByAccount} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis tickFormatter={(v) => compactINR(Number(v))} tickLine={false} axisLine={false} width={64} /><Tooltip formatter={(value) => formatINR(Number(value ?? 0))} /><Bar dataKey="amount" name="Spend" fill="var(--primary)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
        </DetailChart>
        <DetailChart title="Spend by sub-category" empty="No sub-categories match these filters." noData={spendByCategory.length === 0}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={spendByCategory} layout="vertical" margin={{ left: 12, right: 16, top: 8, bottom: 8 }}><CartesianGrid horizontal={false} stroke="var(--border)" /><XAxis type="number" tickFormatter={(v) => compactINR(Number(v))} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={112} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => formatINR(Number(value ?? 0))} /><Bar dataKey="planned" name="Planned" fill="var(--muted-foreground)" radius={[0, 3, 3, 0]} /><Bar dataKey="amount" name="Actual" fill="var(--primary)" radius={[0, 3, 3, 0]} onClick={(row) => onSelectSubCategory(String(row.name))}>{spendByCategory.map((entry) => <Cell key={entry.name} fill={entry.planned > 0 && entry.amount > entry.planned ? "var(--destructive)" : "var(--primary)"} />)}</Bar></BarChart></ResponsiveContainer>
        </DetailChart>
      </div>

      <DetailChart title="Daily cumulative spend" empty="No transactions yet for this month." noData={filtered.length === 0}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={currentTrend} margin={{ left: 8, right: 16, top: 10, bottom: 0 }}><CartesianGrid stroke="var(--border)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickFormatter={(v) => compactINR(Number(v))} tickLine={false} axisLine={false} width={64} /><Tooltip labelFormatter={(v) => `Day ${v}`} formatter={(value) => formatINR(Number(value ?? 0))} /><Line dataKey="actual" name="Actual" type="monotone" stroke="var(--primary)" strokeWidth={2} dot={false} /><Line dataKey="ideal" name="Ideal pace" type="monotone" stroke="var(--chart-3)" strokeDasharray="5 4" dot={false} /></LineChart></ResponsiveContainer>
      </DetailChart>

      <DetailChart title="This month vs recent months" empty="No sub-category comparison data." noData={comparisonRows.length === 0}>
        <ResponsiveContainer width="100%" height="100%"><BarChart data={comparisonRows} layout="vertical" margin={{ left: 12, right: 16, top: 8, bottom: 8 }}><CartesianGrid horizontal={false} stroke="var(--border)" /><XAxis type="number" tickFormatter={(v) => compactINR(Number(v))} tickLine={false} axisLine={false} /><YAxis type="category" dataKey="name" width={112} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => formatINR(Number(value ?? 0))} /><Bar dataKey="current" name="Selected month" fill="var(--primary)" radius={[0, 3, 3, 0]} /><Bar dataKey="last" name="Previous month" fill="var(--chart-2)" radius={[0, 3, 3, 0]} /><Bar dataKey="average" name="3-month average" fill="var(--chart-3)" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer>
      </DetailChart>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Top transactions</CardTitle></CardHeader><CardContent>
        {topTransactions.length ? <TransactionRows transactions={topTransactions} accounts={accounts} categories={categories} funds={funds} reserves={reserves} payments={[]} editable={false} onRefresh={() => undefined} userId={props.userId} /> : <p className="py-4 text-sm text-muted-foreground">No transactions match these filters.</p>}
      </CardContent></Card>
      {editable ? null : <p className="text-xs text-muted-foreground">This month is read-only.</p>}
    </div>
  );
}

function compactINR(value: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function DetailChart({ title, empty, children, noData = false }: { title: string; empty: string; children: ReactNode; noData?: boolean }) {
  return <Card className="min-w-0"><CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent><div className="h-64 min-w-0 w-full">{noData ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{empty}</div> : children}</div></CardContent></Card>;
}

function FundOverview({ items, funds, transactions, monthTx, onSelect }: { items: DetailSubCategory[]; funds: FundRow[]; transactions: TxRow[]; monthTx: TxRow[]; onSelect: (name: string) => void }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">Fund balances and recent movements</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
    {items.map((item) => {
      const fund = funds.find((f) => f.id === item.fundId);
      if (!fund) return null;
      const balance = computeFundBalance(fund, transactions);
      const contributed = monthTx.filter((tx) => tx.fund_id === fund.id && tx.type === "fund_contribution").reduce((sum, tx) => sum + Number(tx.amount), 0);
      const recent = transactions.filter((tx) => (tx.fund_id === fund.id && (tx.type === "fund_contribution" || tx.type === "fund_withdrawal")) || (tx.type === "surplus_payment" && tx.source_fund_id === fund.id)).slice(0, 3);
      return <Button key={fund.id} variant="outline" onClick={() => onSelect(item.name)} className="h-auto min-h-32 flex-col items-stretch gap-2 whitespace-normal p-4 text-left">
        <span className="flex justify-between gap-2"><span className="font-semibold">{fund.name}</span><ChevronRight className="h-4 w-4" /></span>
        <span className="text-sm tabular-nums">{formatINR(contributed)} / {formatINR(item.planned)} this month</span>
        <span className="text-sm text-muted-foreground">Overall balance · {formatINR(balance)}</span>
        <span className="text-xs text-muted-foreground">{recent.length ? `Recent: ${recent.map((tx) => `${formatDate(tx.date)} ${formatINR(Number(tx.amount))}`).join(" · ")}` : "No recent movements"}</span>
      </Button>;
    })}
  </CardContent></Card>;
}

function SipOverview({ items, monthTx, categories, funds, reserves, onSelect }: { items: DetailSubCategory[]; monthTx: TxRow[]; categories: CategoryRow[]; funds: FundRow[]; reserves: ReserveRow[]; onSelect: (name: string) => void }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">Monthly SIP instalments</CardTitle></CardHeader><CardContent className="divide-y divide-border">
    {items.map((item) => {
      const actual = monthTx.filter((tx) => tx.bucket === "SIP Investments" && subcategoryName(tx, categories, funds, reserves) === item.name).reduce((sum, tx) => sum + Number(tx.amount), 0);
      return <Button key={item.name} variant="ghost" onClick={() => onSelect(item.name)} className={"h-auto min-h-14 w-full justify-between gap-3 rounded-none px-1 py-3 text-left " + (item.muted ? "opacity-60" : "")}>
        <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{item.muted ? "SIP ended" : `${actual >= item.planned && item.planned > 0 ? "Logged" : "Not yet logged"} · ${formatINR(item.planned)} monthly target`}</span></span>
        <span className="shrink-0 text-sm tabular-nums">{formatINR(actual)}{item.planned > 0 ? ` / ${formatINR(item.planned)}` : ""}</span>
      </Button>;
    })}
  </CardContent></Card>;
}

function FixedOverview({ items, onSelect }: { items: DetailSubCategory[]; onSelect: (name: string) => void }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-base">Commitment schedule</CardTitle></CardHeader><CardContent className="divide-y divide-border">
    {items.map((item) => <Button key={item.name} variant="ghost" onClick={() => onSelect(item.name)} className={"h-auto min-h-12 w-full justify-between gap-3 rounded-none px-1 py-3 text-left " + (item.muted ? "opacity-60" : "")}><span className="text-sm font-medium">{item.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{item.note}</span></span><span className="shrink-0 text-sm tabular-nums">{formatINR(item.planned)}</span></Button>)}
  </CardContent></Card>;
}

function TaxOverview({ reserve, transactions, actual, planned }: { reserve: ReserveRow | undefined; transactions: TxRow[]; actual: number; planned: number }) {
  const balance = reserve ? computeReserveBalance(reserve, transactions) : 0;
  return <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">This month accrued</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatINR(actual)} / {formatINR(planned)}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Total reserve accumulated</p><p className="mt-1 text-lg font-semibold tabular-nums">{formatINR(balance)}</p></div></CardContent></Card>;
}

function SubcategoryDetailView(props: DetailProps & { subCategory: string; onBack: () => void }) {
  const { bucket, subCategory, monthTx, allTransactions, accounts, categories, funds, reserves, year, month, day, isCurrentMonth, isClosed, userId, onBack, onRefresh, payments } = props;
  const bucketLabel = bucketLabelFor(bucket);
  const items = buildSubCategories(props);
  const item = items.find((candidate) => candidate.name === subCategory) ?? { name: subCategory, planned: 0 };
  const bucketTx = monthTx.filter((tx) => tx.bucket === bucketLabel && matchingSubcategory(tx, item, categories, funds, reserves));
  const availableAccounts = accounts.filter((account) => bucketTx.some((tx) => tx.account_id === account.id));
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const accountSignature = availableAccounts.map((a) => a.id).join("|");
  useEffect(() => setSelectedAccounts(availableAccounts.map((a) => a.id)), [accountSignature]);
  const selected = new Set(selectedAccounts);
  const filtered = bucketTx.filter((tx) => selected.has(tx.account_id));
  const actual = filtered.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const plan = bucket === "others" ? 0 : item.planned;
  const days = new Date(year, month, 0).getDate();
  const currentDaily = makeDailyTrend(filtered, year, month, 0);
  const trend = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(year, month - 1 - (5 - offset), 1);
    const prefix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const amount = allTransactions.filter((tx) => tx.date.startsWith(prefix) && tx.bucket === bucketLabel && matchingSubcategory(tx, item, categories, funds, reserves) && selected.has(tx.account_id)).reduce((sum, tx) => sum + Number(tx.amount), 0);
    return { month: date.toLocaleDateString("en-IN", { month: "short" }), amount };
  });
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const editable = isCurrentMonth && !isClosed;
  const accountNames = Object.fromEntries(accounts.map((account) => [account.id, account.name]));
  const paymentRows = payments;
  return <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
    <BackBar label={subCategory} onBack={onBack} />
    <section className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold">{subCategory}</h2><p className="mt-1 text-sm text-muted-foreground">{bucketLabel} · {isCurrentMonth ? `Day ${day} of ${days}` : "Read-only month view"}</p></div><div className="text-right"><div className="text-2xl font-semibold tabular-nums">{formatINR(actual)}{plan > 0 ? <span className="text-base font-normal text-muted-foreground"> / {formatINR(plan)}</span> : null}</div>{plan > 0 ? <p className={"mt-1 text-sm " + (actual > plan ? "text-destructive" : isCurrentMonth && actual > plan * day / days * 1.1 ? "text-warning" : "text-muted-foreground")}>{actual > plan ? "Over budget" : isCurrentMonth && actual > plan * day / days * 1.1 ? "Ahead of pace" : "On track"}</p> : null}</div></section>
    {plan > 0 ? <PaceProgress actual={actual} planned={plan} day={day} days={days} showMarker={isCurrentMonth} /> : null}
    <Card><CardContent className="p-4"><div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Accounts</div>{availableAccounts.length ? accountFilterPills(accounts, availableAccounts, selectedAccounts, setSelectedAccounts) : <p className="text-sm text-muted-foreground">No transactions for this sub-category in the selected month.</p>}</CardContent></Card>
    <div className="grid gap-4 xl:grid-cols-2">
      <DetailChart title="Daily spend" empty="No transactions yet for this month." noData={filtered.length === 0}><ResponsiveContainer width="100%" height="100%"><BarChart data={currentDaily} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickFormatter={(v) => compactINR(Number(v))} tickLine={false} axisLine={false} width={64} /><Tooltip labelFormatter={(v) => `Day ${v}`} formatter={(value) => formatINR(Number(value ?? 0))} /><Bar dataKey="daily" name="Spent" fill="var(--primary)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></DetailChart>
      <DetailChart title="Six-month trend" empty="No spending history found." noData={trend.every((point) => point.amount === 0)}><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}><CartesianGrid stroke="var(--border)" /><XAxis dataKey="month" tickLine={false} axisLine={false} /><YAxis tickFormatter={(v) => compactINR(Number(v))} tickLine={false} axisLine={false} width={64} /><Tooltip formatter={(value) => formatINR(Number(value ?? 0))} /><Line dataKey="amount" name="Spent" type="monotone" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></DetailChart>
    </div>
    <Card><CardHeader className="flex flex-row items-center justify-between gap-3 pb-2"><CardTitle className="text-base">Transactions</CardTitle>{editable && !item.muted ? <QuickAddDialog {...props} item={item} onSaved={onRefresh} /> : null}</CardHeader><CardContent><TransactionRows transactions={sorted} accounts={accounts} categories={categories} funds={funds} reserves={reserves} payments={paymentRows} editable={editable} onRefresh={onRefresh} userId={userId} accountNames={accountNames} /></CardContent></Card>
  </div>;
}

function QuickAddDialog(props: DetailProps & { item: DetailSubCategory; onSaved: () => void }) {
  const { bucket, item, accounts, categories, funds, reserves, userId, onSaved } = props;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const defaultCode = bucket === "sip" ? "HDFC" : bucket === "regular" || bucket === "others" ? "CUB" : "SBI";
  const [accountId, setAccountId] = useState(accounts.find((a) => a.code === defaultCode)?.id ?? accounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const type = bucket === "funds" ? "fund_contribution" : bucket === "tax" ? "reserve_accrual" : "expense";
  async function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || !date || !accountId) { toast.error("Enter a date, account, and positive amount."); return; }
    const chosenAccount = accounts.find((account) => account.id === accountId);
    const creditCardExpense = type === "expense" && chosenAccount?.code === "CCARD";
    const row: Record<string, unknown> = { user_id: userId, date, type, amount: value, description: description.trim(), payment_mode: paymentMode.trim() || null, account_id: accountId, destination_account_id: null, category_id: null, fund_id: null, reserve_id: null, bucket: bucketLabelFor(bucket), sub_category: item.name, is_credit_card: creditCardExpense, credit_card_paid_amount: 0, credit_card_payment_status: creditCardExpense ? "unpaid" : null };
    if (bucket === "regular" || bucket === "fixed") {
      const category = categories.find((c) => c.id === item.categoryId || c.name === item.name);
      if (!category) { toast.error("This category is no longer available."); return; }
      row.category_id = category.id;
    }
    if (bucket === "funds") {
      const fund = funds.find((f) => f.id === item.fundId || f.name === item.name);
      if (!fund) { toast.error("This fund is no longer available."); return; }
      row.fund_id = fund.id;
      row.account_id = fund.account_id;
    }
    if (bucket === "tax") {
      const reserve = reserves.find((r) => r.name.toLowerCase().includes("tax"));
      if (!reserve) { toast.error("Tax Reserve is not configured."); return; }
      row.reserve_id = reserve.id;
      row.account_id = reserve.account_id;
    }
    setBusy(true);
    const { error } = await supabase.from("transactions").insert(row as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Transaction saved");
    setOpen(false);
    setAmount("");
    setDescription("");
    setPaymentMode("");
    onSaved();
  }
  return <><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add transaction</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle>Add transaction · {item.name}</DialogTitle></DialogHeader><div className="grid gap-3">
    <div><Label className="mb-1.5 block text-xs text-muted-foreground">Bucket</Label><Input value={bucketLabelFor(bucket)} readOnly /></div>
    <div><Label className="mb-1.5 block text-xs text-muted-foreground">Sub-category</Label><Input value={item.name} readOnly /></div>
    <div><Label className="mb-1.5 block text-xs text-muted-foreground">Account</Label><Select value={accountId} onValueChange={setAccountId}><SelectTrigger><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid grid-cols-2 gap-3"><div><Label className="mb-1.5 block text-xs text-muted-foreground">Amount (₹)</Label><Input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div><div><Label className="mb-1.5 block text-xs text-muted-foreground">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></div>
    <div><Label className="mb-1.5 block text-xs text-muted-foreground">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" /></div>
    <div><Label className="mb-1.5 block text-xs text-muted-foreground">Payment mode</Label><Input value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} placeholder="Optional" /></div>
  </div><DialogFooter><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save transaction"}</Button></DialogFooter></DialogContent></Dialog></>;
}

function TransactionRows({ transactions, accounts, categories, funds, reserves, payments, editable, onRefresh, userId, accountNames }: { transactions: TxRow[]; accounts: AccountRow[]; categories: CategoryRow[]; funds: FundRow[]; reserves: ReserveRow[]; payments: { transaction_id: string; payment_transaction_id: string | null }[]; editable: boolean; onRefresh: () => void; userId: string; accountNames?: Record<string, string> }) {
  const [editing, setEditing] = useState<TxRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TxRow | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [busy, setBusy] = useState(false);
  function beginEdit(tx: TxRow) { setEditing(tx); setAmount(String(tx.amount)); setDate(tx.date); setDescription(tx.description ?? ""); setPaymentMode(tx.payment_mode ?? ""); }
  async function saveEdit() {
    if (!editing) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || !date) { toast.error("Enter a date and a positive amount."); return; }
    if (value < Number(editing.credit_card_paid_amount ?? 0)) { toast.error("Amount cannot be lower than payments already logged."); return; }
    setBusy(true);
    const { error } = await supabase.from("transactions").update({ amount: value, date, description: description.trim(), payment_mode: paymentMode.trim() || null }).eq("id", editing.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEditing(null); toast.success("Transaction updated"); onRefresh();
  }
  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      if (pendingDelete.is_credit_card) {
        const paymentIds = payments.filter((p) => p.transaction_id === pendingDelete.id).map((p) => p.payment_transaction_id).filter((id): id is string => !!id);
        await deleteCreditCardTransaction(pendingDelete.id, paymentIds);
      } else {
        const { error } = await supabase.from("transactions").delete().eq("id", pendingDelete.id);
        if (error) throw error;
      }
      setPendingDelete(null); toast.success("Transaction deleted"); onRefresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete transaction"); }
    setBusy(false);
  }
  const paid = pendingDelete ? Number(pendingDelete.credit_card_paid_amount ?? 0) : 0;
  return <>
    {transactions.length ? <ul className="divide-y divide-border">{transactions.map((tx) => <li key={tx.id} className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0"><p className="truncate text-sm font-medium">{tx.description || tx.sub_category || "Transaction"}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatDate(tx.date)} · {accountNames?.[tx.account_id] ?? accounts.find((a) => a.id === tx.account_id)?.name ?? "Account"}{tx.payment_mode ? ` · ${tx.payment_mode}` : ""}</p></div>
      <div className="flex shrink-0 items-center gap-2"><span className="text-sm font-medium tabular-nums">{formatINR(Number(tx.amount))}</span>{editable ? <><Button variant="ghost" size="icon" aria-label="Edit transaction" title="Edit transaction" onClick={() => beginEdit(tx)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="Delete transaction" title="Delete transaction" onClick={() => setPendingDelete(tx)}><Trash2 /></Button></> : null}</div>
    </li>)}</ul> : <p className="py-5 text-sm text-muted-foreground">No transactions in this sub-category for the selected month.</p>}
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Edit transaction</DialogTitle></DialogHeader><div className="grid gap-3"><div><Label className="mb-1.5 block text-xs text-muted-foreground">Amount (₹)</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div><div><Label className="mb-1.5 block text-xs text-muted-foreground">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div><div><Label className="mb-1.5 block text-xs text-muted-foreground">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div><div><Label className="mb-1.5 block text-xs text-muted-foreground">Payment mode</Label><Input value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} /></div></div><DialogFooter><Button onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>
    <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this transaction?</AlertDialogTitle><AlertDialogDescription>{pendingDelete?.is_credit_card && paid > 0 ? `This transaction has ${formatINR(paid)} in payments logged. Deleting it will also remove those payment records and reverse the account balance adjustments. Proceed?` : "This cannot be undone."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmDelete(); }} disabled={busy}>{busy ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>;
}

// ---------- Level 1 ----------

interface BucketRow {
  key: string;
  label: string;
  sub: string;
  actual: number;
  planned: number;
  drill: boolean;
}

function Level1({
  rows,
  onDrill,
  unallocated,
  plannedUnallocated,
  remainderMissing,
}: {
  rows: BucketRow[];
  onDrill: (key: string) => void;
  unallocated: number;
  plannedUnallocated: number;
  remainderMissing: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Income waterfall</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {rows.map((r) => (
          <BucketBar key={r.key} row={r} onClick={r.drill ? () => onDrill(r.key) : undefined} />
        ))}
        <UnallocatedRow amount={unallocated} planned={plannedUnallocated} highlight={remainderMissing} />
      </CardContent>
    </Card>
  );
}

function BucketBar({ row, onClick }: { row: BucketRow; onClick?: () => void }) {
  const tone = statusTone(row.actual, row.planned);
  const pct = row.planned > 0 ? Math.min(100, (row.actual / row.planned) * 100) : 0;
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={
        "w-full py-4 text-left transition-colors " +
        (clickable ? "hover:bg-muted/40 cursor-pointer -mx-6 px-6" : "opacity-100 cursor-default -mx-6 px-6")
      }
    >
      <div className="flex items-baseline justify-between gap-4 mb-1.5">
        <div className="min-w-0">
          <div className="text-sm font-medium">{row.label}</div>
          <div className="text-xs text-muted-foreground">{row.sub}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-sm tabular-nums font-medium">
              {formatINR(row.actual)} <span className="text-muted-foreground font-normal">/ {formatINR(row.planned)}</span>
            </div>
            <div className={"text-xs tabular-nums " + tone.textClass}>{tone.label(row.actual, row.planned)}</div>
          </div>
          {clickable ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : null}
        </div>
      </div>
      <ProgressBar actual={row.actual} planned={row.planned} tone={tone} />
    </button>
  );
}

function UnallocatedRow({ amount, planned, highlight }: { amount: number; planned: number; highlight: boolean }) {
  return (
    <div className={"py-4 flex items-center justify-between -mx-6 px-6 " + (highlight ? "bg-destructive/5" : "")}>
      <div className="flex items-center gap-2">
        {highlight ? <AlertTriangle className="h-4 w-4 text-destructive" /> : null}
        <div>
          <div className={"text-sm font-semibold " + (highlight ? "text-destructive" : "")}>Unallocated</div>
          <div className="text-xs text-muted-foreground">
            Planned unallocated {formatINR(planned)} · {highlight ? "reconcile before month end" : "every planned rupee is accounted for"}
          </div>
        </div>
      </div>
      <div className={"text-sm font-semibold tabular-nums " + (highlight ? "text-destructive" : "text-muted-foreground")}>
        {formatINR(amount)}
      </div>
    </div>
  );
}

// ---------- Level 2 variants ----------

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 h-8">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <span className="text-sm text-muted-foreground">/ {label}</span>
    </div>
  );
}

function Level2Regular({
  categories, spentByCategory, plannedRegular, actualRegular, onBack, onCategory,
}: {
  categories: { id: string; name: string; monthly_limit: number }[];
  spentByCategory: Record<string, number>;
  plannedRegular: number;
  actualRegular: number;
  onBack: () => void;
  onCategory: (id: string) => void;
}) {
  return (
    <div>
      <BackBar label="Regular Expenses" onBack={onBack} />
      <SummaryStrip label="Regular Expenses" actual={actualRegular} planned={plannedRegular} />
      <Card className="mt-4">
        <CardContent className="pt-4 divide-y divide-border">
          {categories.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">No categories yet — add them in Setup.</div>
          ) : [...categories]
            .sort((a, b) => (spentByCategory[b.id] ?? 0) - (spentByCategory[a.id] ?? 0))
            .map((c) => {
            const spent = spentByCategory[c.id] ?? 0;
            const limit = Number(c.monthly_limit) || 0;
            const tone = statusTone(spent, limit);
            return (
              <button key={c.id} onClick={() => onCategory(c.id)}
                      className="w-full py-4 -mx-6 px-6 text-left hover:bg-muted/40 transition-colors">
                <div className="flex items-baseline justify-between mb-1.5 gap-4">
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm tabular-nums font-medium">
                        {formatINR(spent)} <span className="text-muted-foreground font-normal">/ {formatINR(limit)}</span>
                      </div>
                      <div className={"text-xs tabular-nums " + tone.textClass}>{tone.label(spent, limit)}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <ProgressBar actual={spent} planned={limit} tone={tone} />
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Level2SIP({
  investments, actualByInvestment, plannedSIP, actualSIP, onBack,
}: {
  investments: Array<{ id: string; name: string; goal: string; monthly_amount: number; active?: boolean }>;
  actualByInvestment: Record<string, number>;
  plannedSIP: number;
  actualSIP: number;
  onBack: () => void;
}) {
  return (
    <div>
      <BackBar label="SIP Investments" onBack={onBack} />
      <SummaryStrip label="SIP Investments" actual={actualSIP} planned={plannedSIP} />
      <Card className="mt-4">
        <CardContent className="pt-4 divide-y divide-border">
          {investments.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">No SIPs yet — add them in Setup.</div>
          ) : [...investments]
              .sort((a, b) => Number(b.active !== false) - Number(a.active !== false))
              .map((inv) => {
            const stopped = inv.active === false;
            const actual = actualByInvestment[inv.id] ?? 0;
            const planned = stopped ? 0 : Number(inv.monthly_amount) || 0;
            const tone = statusTone(actual, planned);
            return (
              <div key={inv.id} className={"py-4 " + (stopped ? "opacity-60" : "")}>
                <div className="flex items-baseline justify-between mb-1.5 gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{inv.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.goal || "Unassigned"}{stopped ? " · SIP ended" : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm tabular-nums font-medium">
                      {formatINR(actual)} <span className="text-muted-foreground font-normal">/ {formatINR(planned)}</span>
                    </div>
                    <div className={"text-xs tabular-nums " + tone.textClass}>{tone.label(actual, planned)}</div>
                  </div>
                </div>
                <ProgressBar actual={actual} planned={planned} tone={tone} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Level2Funds({
  funds, contribByFund, planned, onBack,
}: {
  funds: Array<{ id: string; code: string; name: string }>;
  contribByFund: Record<string, number>;
  planned: { corpus: number; trip: number };
  onBack: () => void;
}) {
  const totalActual = funds.reduce((s, f) => s + (contribByFund[f.id] ?? 0), 0);
  const totalPlanned = planned.corpus + planned.trip;
  return (
    <div>
      <BackBar label="Fund Contributions" onBack={onBack} />
      <SummaryStrip label="Fund Contributions" actual={totalActual} planned={totalPlanned} />
      <Card className="mt-4">
        <CardContent className="pt-4 divide-y divide-border">
          {funds.map((f) => {
            const actual = contribByFund[f.id] ?? 0;
            const p = f.code === "corpus" ? planned.corpus : f.code === "trip" ? planned.trip : 0;
            const tone = statusTone(actual, p);
            return (
              <div key={f.id} className="py-4">
                <div className="flex items-baseline justify-between mb-1.5 gap-4">
                  <div className="text-sm font-medium">{f.name}</div>
                  <div className="text-right shrink-0">
                    <div className="text-sm tabular-nums font-medium">
                      {formatINR(actual)} <span className="text-muted-foreground font-normal">/ {formatINR(p)}</span>
                    </div>
                    <div className={"text-xs tabular-nums " + tone.textClass}>{tone.label(actual, p)}</div>
                  </div>
                </div>
                <ProgressBar actual={actual} planned={p} tone={tone} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Level2Fixed({
  carEmi, maintenance, extras, maintenanceDue, nextMaintenanceMonth, onBack,
}: {
  carEmi: { actual: number; planned: number };
  maintenance: { actual: number; planned: number };
  extras: Array<{ label: string; planned: number; actual: number }>;
  maintenanceDue: boolean;
  nextMaintenanceMonth: string;
  onBack: () => void;
}) {
  const totalActual = carEmi.actual + maintenance.actual + extras.reduce((s, e) => s + e.actual, 0);
  const totalPlanned = carEmi.planned + maintenance.planned + extras.reduce((s, e) => s + e.planned, 0);
  const rows = [
    { label: "Car EMI", sub: "Monthly — debited from SBI", muted: false, ...carEmi },
    {
      label: "Flat Maintenance",
      sub: maintenanceDue
        ? "Quarterly — due this month"
        : `Not due this month · Next due: ${nextMaintenanceMonth}`,
      muted: !maintenanceDue,
      ...maintenance,
    },
    ...extras.map((e) => ({ label: e.label, sub: "Monthly commitment", muted: false, actual: e.actual, planned: e.planned })),
  ];
  return (
    <div>
      <BackBar label="Fixed Commitments" onBack={onBack} />
      <SummaryStrip label="Fixed Commitments" actual={totalActual} planned={totalPlanned} />
      <Card className="mt-4">
        <CardContent className="pt-4 divide-y divide-border">
          {rows.map((r) => {
            const tone = statusTone(r.actual, r.planned);
            return (
              <div key={r.label} className={"py-4 " + (r.muted ? "opacity-60" : "")}>
                <div className="flex items-baseline justify-between mb-1.5 gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.sub}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm tabular-nums font-medium">
                      {formatINR(r.actual)} <span className="text-muted-foreground font-normal">/ {formatINR(r.planned)}</span>
                    </div>
                    <div className={"text-xs tabular-nums " + tone.textClass}>{tone.label(r.actual, r.planned)}</div>
                  </div>
                </div>
                <ProgressBar actual={r.actual} planned={r.planned} tone={tone} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Level 3 ----------

function Level3({
  category, spent, txs, onBack,
}: {
  category: { id: string; name: string; monthly_limit: number } | null;
  spent: number;
  txs: Array<{ id: string; date: string; description: string; amount: number; payment_mode: string | null; type: string }>;
  onBack: () => void;
}) {
  const limit = Number(category?.monthly_limit ?? 0);
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <div>
      <BackBar label={category?.name ?? "Category"} onBack={onBack} />
      <SummaryStrip label={category?.name ?? "Category"} actual={spent} planned={limit} />
      <Card className="mt-4">
        <CardContent className="pt-4">
          {sorted.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">No transactions in this category this month.</div>
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.description || (t.type === "internal_loan_repayment" ? "Loan repayment" : "Expense")}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(t.date)}{t.payment_mode ? ` · ${t.payment_mode}` : ""}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums font-medium shrink-0">{formatINR(Number(t.amount))}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- shared bits ----------

function SummaryStrip({ label, actual, planned }: { label: string; actual: number; planned: number }) {
  const tone = statusTone(actual, planned);
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {formatINR(actual)} <span className="text-base font-normal text-muted-foreground">/ {formatINR(planned)}</span>
            </div>
          </div>
          <div className={"text-sm tabular-nums " + tone.textClass}>{tone.label(actual, planned)}</div>
        </div>
        <ProgressBar actual={actual} planned={planned} tone={tone} />
      </CardContent>
    </Card>
  );
}

type Tone = { textClass: string; barClass: string; trackClass: string; label: (a: number, p: number) => string };

function statusTone(actual: number, planned: number): Tone {
  if (planned <= 0) {
    return {
      textClass: "text-muted-foreground",
      barClass: "bg-muted-foreground/40",
      trackClass: "bg-muted",
      label: () => "No target set",
    };
  }
  const ratio = actual / planned;
  if (actual > planned) {
    return {
      textClass: "text-destructive",
      barClass: "bg-destructive",
      trackClass: "bg-destructive/15",
      label: (a, p) => `Over by ${formatINR(a - p)}`,
    };
  }
  if (ratio >= 0.9) {
    return {
      textClass: "text-warning",
      barClass: "bg-warning",
      trackClass: "bg-warning/15",
      label: (a, p) => `${formatINR(p - a)} left`,
    };
  }
  return {
    textClass: "text-muted-foreground",
    barClass: "bg-primary",
    trackClass: "bg-primary/15",
    label: (a, p) => `${formatINR(p - a)} left`,
  };
}

function ProgressBar({ actual, planned, tone }: { actual: number; planned: number; tone: Tone }) {
  const pct = planned > 0 ? Math.min(100, Math.max(0, (actual / planned) * 100)) : 0;
  return (
    <div className={"h-2 w-full overflow-hidden rounded-full " + tone.trackClass}>
      <div className={"h-full transition-all " + tone.barClass} style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// legacy exports kept for tree shake — none needed.
export {};