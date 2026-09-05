import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, AlertTriangle, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchAll, seedIfEmpty, formatINR, type Bucket } from "@/lib/finance-db";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecurringPanel } from "@/components/finance/recurring-panel";
import { CloseMonthDialog, type BucketFigure } from "@/components/finance/close-month-dialog";
import { fetchClosures, monthKey, lastDayOfMonth } from "@/lib/month-close";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Ledger" },
      { name: "description", content: "This month's income, spending, fund contributions, and where the rest went." },
    ],
  }),
  component: Dashboard,
});

type Level =
  | { name: "l1" }
  | { name: "l2"; bucket: "regular" | "sip" | "funds" | "fixed" }
  | { name: "l3"; categoryId: string };

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

  const totalAllocated = actualRegular + actualSIP + actualFunds + actualFixed + actualTax;
  const totalPlannedBuckets = plannedRegular + plannedSIP + plannedFundsTotal + plannedFixed + plannedTax;
  const plannedUnallocated = plannedIncome - totalPlannedBuckets;
  const unallocated = plannedIncome - totalAllocated;
  const remainderMissing = Math.abs(unallocated) > 0.5;

  const go = (l: Level) => setLevel(l);

  return (
    <div>
      <PageHeader
        title={monthLabel}
        description="This month's income and how every rupee is being allocated."
      />

      {level.name === "l1" ? <RecurringPanel /> : null}

      {/* Sticky planned-income header — persists across all levels */}
      <Card className="mb-6 sticky top-2 z-10 backdrop-blur bg-card/95">
        <CardContent className="pt-5 pb-5 flex items-baseline justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Planned monthly income</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
              {formatINR(plannedIncome)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">from Setup · salary + net rent</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Allocated so far</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatINR(totalAllocated)}</div>
            <div className={"text-xs tabular-nums mt-0.5 " + (remainderMissing ? "text-warning" : "text-muted-foreground")}>
              {formatINR(Math.max(0, unallocated))} unallocated
            </div>
          </div>
        </CardContent>
      </Card>

      <div key={level.name + ("bucket" in level ? level.bucket : "") + ("categoryId" in level ? level.categoryId : "")}
           className="animate-in fade-in slide-in-from-right-2 duration-200">
        {level.name === "l1" ? (
          <Level1
            rows={[
              { key: "regular", label: "Regular Expenses", sub: "HDFC→CUB spending allocation", actual: actualRegular, planned: plannedRegular, drill: true },
              { key: "sip", label: "SIP Investments", sub: `${activeInvestments.length} active SIP${activeInvestments.length === 1 ? "" : "s"} from HDFC`, actual: actualSIP, planned: plannedSIP, drill: investments.length > 0 },
              { key: "funds", label: "Fund Contributions", sub: "Corpus + Trip (held inside SBI)", actual: actualFunds, planned: plannedFundsTotal, drill: true },
              { key: "fixed", label: "Fixed Commitments", sub: maintenanceDue ? "Car EMI + Flat Maintenance (due)" : "Car EMI · Flat Maintenance not due", actual: actualFixed, planned: plannedFixed, drill: true },
              { key: "tax", label: "Tax Reserve", sub: "Monthly accrual inside SBI", actual: actualTax, planned: plannedTax, drill: false },
            ]}
            onDrill={(key) => go({ name: "l2", bucket: key as "regular" | "sip" | "funds" | "fixed" })}
            unallocated={unallocated}
            plannedUnallocated={plannedUnallocated}
            remainderMissing={remainderMissing}
          />
        ) : level.name === "l2" && level.bucket === "regular" ? (
          <Level2Regular
            categories={regularCategories}
            spentByCategory={spentByCategory}
            plannedRegular={plannedRegular}
            actualRegular={actualRegular}
            onBack={() => go({ name: "l1" })}
            onCategory={(id) => go({ name: "l3", categoryId: id })}
          />
        ) : level.name === "l2" && level.bucket === "sip" ? (
          <Level2SIP
            investments={investments}
            actualByInvestment={actualSIPByInvestment}
            plannedSIP={plannedSIP}
            actualSIP={actualSIP}
            onBack={() => go({ name: "l1" })}
          />
        ) : level.name === "l2" && level.bucket === "funds" ? (
          <Level2Funds
            funds={funds}
            contribByFund={contribByFund}
            planned={{ corpus: Number(planData.plan?.planned_corpus_contribution ?? 0), trip: Number(planData.plan?.planned_trip_contribution ?? 0) }}
            onBack={() => go({ name: "l1" })}
          />
        ) : level.name === "l2" && level.bucket === "fixed" ? (
          <Level2Fixed
            carEmi={{ actual: carEmiCat ? spentByCategory[carEmiCat.id] ?? 0 : 0, planned: plannedCarEmi }}
            maintenance={{ actual: maintenanceCat ? spentByCategory[maintenanceCat.id] ?? 0 : 0, planned: plannedMaintenance }}
            extras={extraFixedCategories.map((c) => ({
              label: c.name,
              planned: Number(c.monthly_limit ?? 0),
              actual: spentByCategory[c.id] ?? 0,
            }))}
            maintenanceDue={maintenanceDue}
            nextMaintenanceMonth={nextMaintenanceMonth}
            onBack={() => go({ name: "l1" })}
          />
        ) : level.name === "l3" ? (
          <Level3
            category={categories.find((c) => c.id === level.categoryId) ?? null}
            spent={spentByCategory[level.categoryId] ?? 0}
            txs={monthTx.filter((t) => t.category_id === level.categoryId && (t.type === "expense" || t.type === "internal_loan_repayment"))}
            onBack={() => go({ name: "l2", bucket: "regular" })}
          />
        ) : null}
      </div>
    </div>
  );
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