import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { seedIfEmpty, formatINR } from "@/lib/finance-db";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Setup — Ledger" },
      { name: "description", content: "Configure opening balances, budgets, funds and recurring amounts." },
    ],
  }),
  component: SetupPage,
});

// ---------- types ----------
type AccountForm = { id: string; code: string; name: string; opening_balance: string; opening_date: string };
type ReserveForm = { id: string; name: string; amount: string; monthly_accrual: string };
type FundForm = { id: string; code: string; name: string; opening_balance: string; monthly_target: string };
type CategoryForm = { id: string | null; name: string; monthly_limit: string; sort_order: number; bucket: string; _deleted?: boolean };
type InvestmentForm = {
  id: string | null;
  name: string;
  goal: string;
  monthly_amount: string;
  invested_total: string;
  active: boolean;
  kite_symbol: string;
  _deleted?: boolean;
};
type PlanForm = {
  planned_monthly_income: string;
  planned_car_emi: string;
  planned_maintenance: string;
  planned_tax_reserve: string;
  planned_corpus_contribution: string;
  planned_trip_contribution: string;
  annual_tax_estimate: string;
};
type RecurringForm = { salary: string; rent: string; hdfc_to_cub: string };

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isFixedCategory = (name: string) => {
  const n = name.trim().toLowerCase();
  return n === "car emi" || n === "maintenance" || n === "flat maintenance";
};

function SetupPage() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const q = useQuery({
    queryKey: ["setup", user?.id],
    enabled: !!user,
    queryFn: async () => {
      await seedIfEmpty(user!.id);
      const [accounts, reserves, funds, categories, investments, plan, recurring] = await Promise.all([
        supabase.from("accounts").select("id,code,name,opening_balance,opening_date").order("code"),
        supabase.from("reserves").select("id,name,amount,monthly_accrual,account_id").order("name"),
        supabase.from("funds").select("id,code,name,opening_balance,monthly_target").order("code"),
        supabase.from("categories").select("id,name,monthly_limit,sort_order,bucket").order("sort_order"),
        supabase.from("investments").select("id,name,goal,monthly_amount,invested_total,active,kite_symbol").order("name"),
        supabase.from("budget_plan").select("*").maybeSingle(),
        supabase.from("recurring_templates").select("id,name,amount,type,account_id,destination_account_id").in("name", ["Salary", "Rent", "HDFC→CUB"]),
      ]);
      const err = accounts.error || reserves.error || funds.error || categories.error || investments.error || plan.error || recurring.error;
      if (err) throw err;
      return {
        accounts: accounts.data ?? [],
        reserves: reserves.data ?? [],
        funds: funds.data ?? [],
        categories: categories.data ?? [],
        investments: investments.data ?? [],
        plan: plan.data,
        recurring: recurring.data ?? [],
      };
    },
  });

  if (loading || !session) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (q.isLoading || !q.data) return <div className="text-sm text-muted-foreground">Loading setup…</div>;

  return (
    <SetupForm
      key={q.dataUpdatedAt}
      userId={user!.id}
      data={q.data as never}
      onSaved={() => {
        qc.invalidateQueries({ queryKey: ["setup", user!.id] });
        qc.invalidateQueries({ queryKey: ["finance", user!.id] });
        qc.invalidateQueries({ queryKey: ["dashboard-plan", user!.id] });
      }}
    />
  );
}

interface SetupData {
  accounts: Array<{ id: string; code: string; name: string; opening_balance: number; opening_date: string }>;
  reserves: Array<{ id: string; name: string; amount: number; monthly_accrual: number | null; account_id: string }>;
  funds: Array<{ id: string; code: string; name: string; opening_balance: number; monthly_target: number }>;
  categories: Array<{ id: string; name: string; monthly_limit: number; sort_order: number; bucket: string }>;
  investments: Array<{ id: string; name: string; goal: string; monthly_amount: number; invested_total: number; active: boolean; kite_symbol: string | null }>;
  plan: {
    planned_monthly_income: number; planned_car_emi: number; planned_maintenance: number;
    planned_tax_reserve: number; planned_corpus_contribution: number; planned_trip_contribution: number;
    annual_tax_estimate?: number;
  } | null;
  recurring: Array<{ id: string; name: string; amount: number; type: string; account_id: string; destination_account_id: string | null }>;
}

function SetupForm({ userId, data, onSaved }: { userId: string; data: SetupData; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<AccountForm[]>(
    data.accounts.map((a) => ({
      id: a.id, code: a.code, name: a.name,
      opening_balance: String(a.opening_balance ?? 0),
      opening_date: a.opening_date ?? new Date().toISOString().slice(0, 10),
    })),
  );

  const [reserves, setReserves] = useState<ReserveForm[]>(
    data.reserves.map((r) => ({
      id: r.id, name: r.name,
      amount: String(r.amount ?? 0),
      monthly_accrual: r.monthly_accrual == null ? "" : String(r.monthly_accrual),
    })),
  );

  const [funds, setFunds] = useState<FundForm[]>(
    data.funds.map((f) => ({
      id: f.id, code: f.code, name: f.name,
      opening_balance: String(f.opening_balance ?? 0),
      monthly_target: String(f.monthly_target ?? 0),
    })),
  );

  const [categories, setCategories] = useState<CategoryForm[]>(
    data.categories.map((c) => ({
      id: c.id, name: c.name, monthly_limit: String(c.monthly_limit ?? 0), sort_order: c.sort_order,
      bucket: c.bucket || (isFixedCategory(c.name) ? "Fixed Commitments" : "Regular Expenses"),
    })),
  );

  const [investments, setInvestments] = useState<InvestmentForm[]>(
    data.investments.map((i) => ({
      id: i.id, name: i.name, goal: i.goal,
      monthly_amount: String(i.monthly_amount ?? 0),
      invested_total: String(i.invested_total ?? 0),
      active: i.active !== false,
      kite_symbol: i.kite_symbol ?? "",
    })),
  );

  const [plan, setPlan] = useState<PlanForm>({
    planned_monthly_income: String(data.plan?.planned_monthly_income ?? 0),
    planned_car_emi: String(data.plan?.planned_car_emi ?? 0),
    planned_maintenance: String(data.plan?.planned_maintenance ?? 0),
    planned_tax_reserve: String(data.plan?.planned_tax_reserve ?? 0),
    planned_corpus_contribution: String(data.plan?.planned_corpus_contribution ?? 0),
    planned_trip_contribution: String(data.plan?.planned_trip_contribution ?? 0),
    annual_tax_estimate: String(data.plan?.annual_tax_estimate ?? 0),
  });

  const recurringByName = useMemo(
    () => Object.fromEntries(data.recurring.map((r) => [r.name, r])),
    [data.recurring],
  );
  const [recurring, setRecurring] = useState<RecurringForm>({
    salary: String(recurringByName["Salary"]?.amount ?? 0),
    rent: String(recurringByName["Rent"]?.amount ?? 0),
    hdfc_to_cub: String(recurringByName["HDFC→CUB"]?.amount ?? 0),
  });

  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const accountByCode = Object.fromEntries(accounts.map((a) => [a.code, a]));

  // ---------- live derived figures ----------
  const income = num(plan.planned_monthly_income);

  const visibleCategories = categories.filter(
    (c) => !c._deleted && c.bucket === "Regular Expenses" && !isFixedCategory(c.name),
  );
  const extraCommitments = categories.filter(
    (c) => !c._deleted && c.bucket === "Fixed Commitments" && !isFixedCategory(c.name),
  );
  const extraCommitmentsTotal = extraCommitments.reduce((s, c) => s + num(c.monthly_limit), 0);
  const categoriesTotal = visibleCategories.reduce((s, c) => s + num(c.monthly_limit), 0);
  const cubTransfer = num(recurring.hdfc_to_cub);

  const activeSipTotal = investments
    .filter((i) => !i._deleted && i.active)
    .reduce((s, i) => s + num(i.monthly_amount), 0);

  const fundTargetTotal = funds.reduce((s, f) => s + num(f.monthly_target), 0);

  const carEmi = num(plan.planned_car_emi);
  const flatMaintenance = num(plan.planned_maintenance);
  const flatMaintenanceMonthly = flatMaintenance / 3;

  const taxAccrual = num(plan.planned_tax_reserve);
  const taxReserveRow = reserves.find((r) => !r.name.toLowerCase().includes("floor"));
  const annualTaxEstimate = num(plan.annual_tax_estimate);

  const rentIncome = num(recurring.rent);
  const sbiResidualRaw = Math.max(0, rentIncome - carEmi - taxAccrual);
  const sbiResidual = Math.min(sbiResidualRaw, fundTargetTotal);
  const hdfcTopUp = Math.max(0, fundTargetTotal - sbiResidual);

  const allocated = cubTransfer + activeSipTotal + fundTargetTotal + carEmi + flatMaintenanceMonthly + extraCommitmentsTotal + taxAccrual;
  const remaining = income - allocated;
  const remainingClass =
    Math.abs(remaining) < 0.5 ? "text-success" : remaining > 0 ? "text-warning" : "text-destructive";

  async function save() {
    setBusy(true);
    try {
      // Guard: never blank out a previously non-zero value.
      const guards: Array<[string, number, number]> = [
        ["Planned monthly income", data.plan?.planned_monthly_income ?? 0, income],
        ["Car EMI", data.plan?.planned_car_emi ?? 0, carEmi],
        ["Flat Maintenance", data.plan?.planned_maintenance ?? 0, flatMaintenance],
        ["Tax Reserve accrual", data.plan?.planned_tax_reserve ?? 0, taxAccrual],
        ["Salary", recurringByName["Salary"]?.amount ?? 0, num(recurring.salary)],
        ["Rent", recurringByName["Rent"]?.amount ?? 0, num(recurring.rent)],
        ["HDFC→CUB transfer", recurringByName["HDFC→CUB"]?.amount ?? 0, cubTransfer],
      ];
      for (const f of funds) {
        const prev = data.funds.find((x) => x.id === f.id);
        guards.push([`${f.name} monthly target`, Number(prev?.monthly_target ?? 0), num(f.monthly_target)]);
      }
      for (const [label, before, after] of guards) {
        if (Number(before) > 0 && after === 0) {
          console.error(`Setup save aborted: ${label} would be overwritten from ${before} to 0`);
          toast.error(`Save aborted — "${label}" would be reset to 0. Restore a value first.`);
          setBusy(false);
          return;
        }
      }

      // 1. Accounts
      for (const a of accounts) {
        const { error } = await supabase.from("accounts").update({
          opening_balance: num(a.opening_balance),
          opening_date: a.opening_date,
        }).eq("id", a.id);
        if (error) throw error;
      }

      // 2. Reserves (tax reserve monthly accrual is driven by Section 5)
      for (const r of reserves) {
        const isTax = !r.name.toLowerCase().includes("floor");
        const { error } = await supabase.from("reserves").update({
          amount: num(r.amount),
          monthly_accrual: isTax ? taxAccrual : (r.monthly_accrual === "" ? null : num(r.monthly_accrual)),
        }).eq("id", r.id);
        if (error) throw error;
      }

      // 3. Funds
      for (const f of funds) {
        const { error } = await supabase.from("funds").update({
          opening_balance: num(f.opening_balance),
          monthly_target: num(f.monthly_target),
        }).eq("id", f.id);
        if (error) throw error;
      }

      // 4. Categories
      for (const c of categories) {
        if (c._deleted && c.id) {
          const { error } = await supabase.from("categories").delete().eq("id", c.id);
          if (error) throw error;
          continue;
        }
        if (c._deleted || !c.name.trim()) continue;
        const nm = c.name.trim();
        // Car EMI / Flat Maintenance amounts are driven by the plan inputs below.
        const limit =
          nm.toLowerCase() === "car emi" ? carEmi
          : isFixedCategory(nm) ? flatMaintenance
          : num(c.monthly_limit);
        if (c.id) {
          const { error } = await supabase.from("categories").update({
            name: nm, monthly_limit: limit, sort_order: c.sort_order, bucket: c.bucket,
          }).eq("id", c.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("categories").insert({
            user_id: userId, name: nm, monthly_limit: limit, sort_order: c.sort_order, bucket: c.bucket,
          });
          if (error) throw error;
        }
      }

      // 5. Investments
      for (const inv of investments) {
        if (inv._deleted && inv.id) {
          const { error } = await supabase.from("investments").delete().eq("id", inv.id);
          if (error) throw error;
          continue;
        }
        if (inv._deleted || !inv.name.trim()) continue;
        const payload = {
          user_id: userId,
          name: inv.name.trim(),
          goal: inv.goal.trim() || "Unassigned",
          monthly_amount: num(inv.monthly_amount),
          invested_total: num(inv.invested_total),
          active: inv.active,
          kite_symbol: inv.kite_symbol.trim() || null,
          source_account_id: accountByCode["HDFC"]?.id ?? null,
        };
        if (inv.id) {
          const { error } = await supabase.from("investments").update(payload).eq("id", inv.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("investments").insert(payload);
          if (error) throw error;
        }
      }

      // 6. Budget plan — fund contributions mirror the fund targets
      const corpus = funds.find((f) => f.code === "corpus");
      const trip = funds.find((f) => f.code === "trip");
      const { error: planErr } = await supabase.from("budget_plan").upsert({
        user_id: userId,
        planned_monthly_income: income,
        planned_car_emi: carEmi,
        planned_maintenance: flatMaintenance,
        planned_tax_reserve: taxAccrual,
        planned_corpus_contribution: corpus ? num(corpus.monthly_target) : num(plan.planned_corpus_contribution),
        planned_trip_contribution: trip ? num(trip.monthly_target) : num(plan.planned_trip_contribution),
        annual_tax_estimate: annualTaxEstimate,
      }, { onConflict: "user_id" });
      if (planErr) throw planErr;

      // 7. Recurring templates
      const hdfc = accountByCode["HDFC"]?.id;
      const cub = accountByCode["CUB"]?.id;
      const sbi = accountByCode["SBI"]?.id;
      const specs: Array<{ name: string; amount: number; type: "income" | "transfer"; account_id: string | undefined; destination_account_id: string | null }> = [
        { name: "Salary", amount: num(recurring.salary), type: "income", account_id: hdfc, destination_account_id: null },
        { name: "Rent", amount: num(recurring.rent), type: "income", account_id: sbi, destination_account_id: null },
        { name: "HDFC→CUB", amount: cubTransfer, type: "transfer", account_id: hdfc, destination_account_id: cub ?? null },
      ];
      for (const spec of specs) {
        if (!spec.account_id) continue;
        const existing = recurringByName[spec.name];
        if (existing) {
          const { error } = await supabase.from("recurring_templates").update({
            amount: spec.amount, account_id: spec.account_id,
            destination_account_id: spec.destination_account_id, type: spec.type,
          }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("recurring_templates").insert({
            user_id: userId, name: spec.name, amount: spec.amount, type: spec.type,
            account_id: spec.account_id, destination_account_id: spec.destination_account_id,
          });
          if (error) throw error;
        }
      }

      setLastSaved(new Date());
      toast.success("Setup saved");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      console.error(e);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Setup"
        description="Everything the dashboard reads: opening balances, income sources and the five monthly buckets."
      />

      {/* Reconciliation header */}
      <Card className="mb-5 sticky top-2 z-20 backdrop-blur bg-card/95">
        <CardContent className="py-4">
          <div className="grid grid-cols-3 gap-4 text-sm tabular-nums">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Planned income</div>
              <div className="mt-1 text-lg font-semibold">{formatINR(income)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Allocated</div>
              <div className="mt-1 text-lg font-semibold">{formatINR(allocated)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</div>
              <div className={"mt-1 text-lg font-semibold " + remainingClass}>{formatINR(remaining)}</div>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-xs tabular-nums text-muted-foreground">
            <Line label="Regular Expenses (CUB transfer)" value={cubTransfer} />
            <Line label="SIP Investments (active)" value={activeSipTotal} />
            <Line label="Fund Contributions" value={fundTargetTotal} />
            <Line label="Car EMI" value={carEmi} />
            <Line label="Flat Maintenance (quarterly avg)" value={flatMaintenanceMonthly} />
            <Line label="Other commitments" value={extraCommitmentsTotal} />
            <Line label="Tax Reserve" value={taxAccrual} />
          </div>
        </CardContent>
      </Card>

      <Section title="Planned income" subtitle="Every reconciliation figure on this page and the dashboard reads from this number.">
        <LabeledInput
          label="Total planned monthly income (₹) — salary + net rent"
          type="number" min="0" step="0.01"
          value={plan.planned_monthly_income}
          onChange={(v) => setPlan((p) => ({ ...p, planned_monthly_income: v }))}
        />
      </Section>

      {/* Account opening balances */}
      <Section title="Account opening balances" subtitle="Balance and date each account started tracking from.">
        <div className="space-y-3">
          {accounts.map((a, i) => (
            <div key={a.id} className="grid grid-cols-1 md:grid-cols-[120px_1fr_1fr] gap-3 items-end">
              <div className="text-sm font-medium">{a.name}</div>
              <LabeledInput
                label="Opening balance (₹)" type="number" min="0" step="0.01"
                value={a.opening_balance}
                onChange={(v) => setAccounts((prev) => prev.map((x, idx) => idx === i ? { ...x, opening_balance: v } : x))}
              />
              <LabeledInput
                label="Opening date" type="date"
                value={a.opening_date}
                onChange={(v) => setAccounts((prev) => prev.map((x, idx) => idx === i ? { ...x, opening_date: v } : x))}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Income sources */}
      <Section title="Income sources" subtitle="Monthly inflows into the accounts.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <LabeledInput
            label="Salary → HDFC (₹)" type="number" min="0" step="0.01"
            value={recurring.salary}
            onChange={(v) => setRecurring((r) => ({ ...r, salary: v }))}
          />
          <LabeledInput
            label="Rent → SBI (₹)" type="number" min="0" step="0.01"
            value={recurring.rent}
            onChange={(v) => setRecurring((r) => ({ ...r, rent: v }))}
          />
        </div>
      </Section>

      {/* Reserves */}
      <Section title="Reserves" subtitle="Off-limits portions of an account's balance.">
        <div className="space-y-3">
          {reserves.map((r, i) => (
            <div key={r.id} className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr] gap-3 items-end">
              <div className="text-sm font-medium">{r.name}</div>
              <LabeledInput
                label="Opening amount (₹)" type="number" min="0" step="0.01"
                value={r.amount}
                onChange={(v) => setReserves((prev) => prev.map((x, idx) => idx === i ? { ...x, amount: v } : x))}
              />
              <div className="text-xs text-muted-foreground">
                {r.name.toLowerCase().includes("floor")
                  ? "Static floor — no monthly accrual."
                  : "Monthly accrual is set in the Tax Reserve bucket below."}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* SECTION 1 */}
      <Section title="1 · Regular Expenses" subtitle="Spending categories funded by the HDFC → CUB monthly transfer.">
        <div className="space-y-2">
          {categories.map((c, i) => (c._deleted || c.bucket !== "Regular Expenses" || isFixedCategory(c.name)) ? null : (
            <div key={c.id ?? `new-${i}`} className="grid grid-cols-[1fr_180px_40px] gap-2 items-center">
              <Input
                placeholder="Category name"
                value={c.name}
                onChange={(e) => setCategories((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
              />
              <Input
                type="number" min="0" step="0.01" placeholder="Monthly limit"
                value={c.monthly_limit}
                onChange={(e) => setCategories((prev) => prev.map((x, idx) => idx === i ? { ...x, monthly_limit: e.target.value } : x))}
              />
              <Button
                type="button" variant="ghost" size="icon"
                onClick={() => setCategories((prev) => prev.map((x, idx) => idx === i ? { ...x, _deleted: true } : x))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button" variant="outline" size="sm" className="gap-1.5"
            onClick={() => setCategories((prev) => [
              ...prev,
              { id: null, name: "", monthly_limit: "0", sort_order: (Math.max(0, ...prev.map((p) => p.sort_order)) + 1), bucket: "Regular Expenses" },
            ])}
          >
            <Plus className="h-4 w-4" /> Add category
          </Button>
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <SummaryLine label="Total category budgets" value={categoriesTotal} />
          <LabeledInput
            label="Monthly CUB transfer — HDFC → CUB (₹)"
            type="number" min="0" step="0.01"
            value={recurring.hdfc_to_cub}
            onChange={(v) => setRecurring((r) => ({ ...r, hdfc_to_cub: v }))}
          />
          {Math.abs(categoriesTotal - cubTransfer) > 0.5 ? (
            <Warning>
              Category budgets ({formatINR(categoriesTotal)}) don't match CUB transfer ({formatINR(cubTransfer)}) — consider adjusting
            </Warning>
          ) : null}
        </div>
      </Section>

      {/* SECTION 2 */}
      <Section title="2 · SIP Investments" subtitle="Mutual fund SIPs tagged to long-term goals, sourced from HDFC.">
        <div className="space-y-3">
          {investments.map((inv, i) => inv._deleted ? null : (
            <div key={inv.id ?? `new-inv-${i}`} className="rounded-md border border-border p-3 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_40px] gap-2 items-center">
                <Input
                  placeholder="Fund name"
                  value={inv.name}
                  onChange={(e) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                />
                <Input
                  placeholder="Goal (e.g. Retirement)"
                  value={inv.goal}
                  onChange={(e) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, goal: e.target.value } : x))}
                />
                <Button
                  type="button" variant="ghost" size="icon"
                  onClick={() => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, _deleted: true } : x))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                {inv.active ? (
                  <LabeledInput
                    label="Monthly SIP (₹)" type="number" min="0" step="0.01"
                    value={inv.monthly_amount}
                    onChange={(v) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, monthly_amount: v } : x))}
                  />
                ) : <div className="text-xs text-muted-foreground pb-2">SIP stopped — no monthly amount.</div>}
                <LabeledInput
                  label="Total invested so far (₹)" type="number" min="0" step="0.01"
                  value={inv.invested_total}
                  onChange={(v) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, invested_total: v } : x))}
                />
                <LabeledInput
                  label="Kite symbol (optional)"
                  value={inv.kite_symbol}
                  onChange={(v) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, kite_symbol: v } : x))}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  checked={inv.active}
                  onCheckedChange={(v) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, active: v } : x))}
                />
                <span className="text-xs text-muted-foreground">{inv.active ? "Active" : "Stopped"}</span>
              </div>
            </div>
          ))}
          <Button
            type="button" variant="outline" size="sm" className="gap-1.5"
            onClick={() => setInvestments((prev) => [
              ...prev,
              { id: null, name: "", goal: "", monthly_amount: "0", invested_total: "0", active: true, kite_symbol: "" },
            ])}
          >
            <Plus className="h-4 w-4" /> Add investment
          </Button>
        </div>

        <Separator className="my-4" />
        <SummaryLine label="Total monthly SIP (active)" value={activeSipTotal} />
      </Section>

      {/* SECTION 3 */}
      <Section title="3 · Fund Contributions" subtitle="Monthly contributions to Corpus and Trip funds, held inside SBI.">
        <div className="space-y-3">
          {funds.map((f, i) => (
            <div key={f.id} className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr] gap-3 items-end">
              <div className="text-sm font-medium">{f.name}</div>
              <LabeledInput
                label="Opening balance (₹)" type="number" min="0" step="0.01"
                value={f.opening_balance}
                onChange={(v) => setFunds((prev) => prev.map((x, idx) => idx === i ? { ...x, opening_balance: v } : x))}
              />
              <LabeledInput
                label="Monthly target (₹)" type="number" min="0" step="0.01"
                value={f.monthly_target}
                onChange={(v) => setFunds((prev) => prev.map((x, idx) => idx === i ? { ...x, monthly_target: v } : x))}
              />
            </div>
          ))}
        </div>

        <Separator className="my-4" />
        <div className="space-y-2">
          <SummaryLine label="Combined monthly target" value={fundTargetTotal} />
          <SummaryLine label="Funded from SBI residual" value={sbiResidual} muted />
          <SummaryLine label="Top-up required from HDFC" value={hdfcTopUp} />
          <div className="text-[11px] text-muted-foreground">
            Residual = rent ({formatINR(rentIncome)}) − Car EMI ({formatINR(carEmi)}) − Tax Reserve ({formatINR(taxAccrual)}), capped at the combined target. The HDFC → SBI transfer is computed, not entered.
          </div>
        </div>
      </Section>

      {/* SECTION 4 */}
      <Section title="4 · Fixed Commitments" subtitle="Fixed recurring outflows from SBI.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3 items-end">
            <LabeledInput
              label="Car EMI (₹)" type="number" min="0" step="0.01"
              value={plan.planned_car_emi}
              onChange={(v) => setPlan((p) => ({ ...p, planned_car_emi: v }))}
            />
            <div className="text-xs text-muted-foreground pb-2.5">Monthly — debited from SBI</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3 items-end">
            <LabeledInput
              label="Flat Maintenance (₹)" type="number" min="0" step="0.01"
              value={plan.planned_maintenance}
              onChange={(v) => setPlan((p) => ({ ...p, planned_maintenance: v }))}
            />
            <div className="text-xs text-muted-foreground pb-2.5">Quarterly — Jan, Apr, Jul, Oct — debited from SBI</div>
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Other commitments</div>
            {categories.map((c, i) => (c._deleted || c.bucket !== "Fixed Commitments" || isFixedCategory(c.name)) ? null : (
              <div key={c.id ?? `new-fx-${i}`} className="grid grid-cols-[1fr_180px_40px] gap-2 items-center">
                <Input
                  placeholder="Commitment name"
                  value={c.name}
                  onChange={(e) => setCategories((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                />
                <Input
                  type="number" min="0" step="0.01" placeholder="Monthly amount"
                  value={c.monthly_limit}
                  onChange={(e) => setCategories((prev) => prev.map((x, idx) => idx === i ? { ...x, monthly_limit: e.target.value } : x))}
                />
                <Button
                  type="button" variant="ghost" size="icon"
                  onClick={() => setCategories((prev) => prev.map((x, idx) => idx === i ? { ...x, _deleted: true } : x))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button" variant="outline" size="sm" className="gap-1.5"
              onClick={() => setCategories((prev) => [
                ...prev,
                { id: null, name: "", monthly_limit: "0", sort_order: (Math.max(0, ...prev.map((p) => p.sort_order)) + 1), bucket: "Fixed Commitments" },
              ])}
            >
              <Plus className="h-4 w-4" /> Add commitment
            </Button>
          </div>
          <Separator />
          <SummaryLine label="Car EMI (monthly)" value={carEmi} />
          <SummaryLine label="Flat Maintenance (quarterly avg)" value={flatMaintenanceMonthly} />
          {extraCommitmentsTotal > 0 ? <SummaryLine label="Other commitments" value={extraCommitmentsTotal} /> : null}
        </div>
      </Section>

      {/* SECTION 5 */}
      <Section title="5 · Tax Reserve" subtitle="Monthly set-aside from rental income toward annual tax on rental earnings.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <LabeledInput
            label="Monthly accrual (₹)" type="number" min="0" step="0.01"
            value={plan.planned_tax_reserve}
            onChange={(v) => setPlan((p) => ({ ...p, planned_tax_reserve: v }))}
          />
          <LabeledInput
            label="Opening reserve balance (₹)" type="number" min="0" step="0.01"
            value={taxReserveRow?.amount ?? "0"}
            onChange={(v) => setReserves((prev) => prev.map((x) => x.id === taxReserveRow?.id ? { ...x, amount: v } : x))}
          />
          <LabeledInput
            label="Annual tax estimate (₹) — optional" type="number" min="0" step="0.01"
            value={plan.annual_tax_estimate}
            onChange={(v) => setPlan((p) => ({ ...p, annual_tax_estimate: v }))}
          />
        </div>
        <div className="mt-3 text-xs text-muted-foreground">Debited from SBI rental income</div>
        {annualTaxEstimate > 0 && taxAccrual > 0 ? (
          <div className="mt-1 text-xs text-muted-foreground">
            Monthly accrual of {formatINR(taxAccrual)} covers this estimate in {Math.ceil(annualTaxEstimate / taxAccrual)} months
          </div>
        ) : null}
      </Section>

      <div className="sticky bottom-4 mt-8 flex items-center justify-end gap-3">
        {lastSaved ? (
          <span className="text-xs text-muted-foreground bg-background/80 backdrop-blur rounded px-2 py-1">
            Last saved: {lastSaved.toLocaleString("en-IN")}
          </span>
        ) : null}
        <Button onClick={save} disabled={busy} size="lg">
          {busy ? "Saving…" : "Save setup"}
        </Button>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-foreground">{formatINR(value)}</span>
    </div>
  );
}

function SummaryLine({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-sm tabular-nums">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground" : "font-medium"}>{formatINR(value)}</span>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <span className="text-foreground">{children}</span>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="mb-5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function LabeledInput({
  label, hint, value, onChange, type = "text", min, step,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  min?: string;
  step?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      <Input type={type} min={min} step={step} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}
