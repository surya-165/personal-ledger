import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { seedIfEmpty, formatINR } from "@/lib/finance-db";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
type CategoryForm = { id: string | null; name: string; monthly_limit: string; sort_order: number; _deleted?: boolean };
type InvestmentForm = { id: string | null; name: string; goal: string; monthly_amount: string; invested_total: string; _deleted?: boolean };
type PlanForm = {
  planned_monthly_income: string;
  planned_car_emi: string;
  planned_maintenance: string;
  planned_tax_reserve: string;
  planned_corpus_contribution: string;
  planned_trip_contribution: string;
};
type RecurringForm = { salary: string; rent: string; hdfc_to_cub: string };

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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
        supabase.from("categories").select("id,name,monthly_limit,sort_order").order("sort_order"),
        supabase.from("investments").select("id,name,goal,monthly_amount,invested_total").order("name"),
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
      userId={user!.id}
      data={q.data}
      onSaved={() => {
        qc.invalidateQueries({ queryKey: ["setup", user!.id] });
        qc.invalidateQueries({ queryKey: ["finance", user!.id] });
      }}
    />
  );
}

function SetupForm({
  userId,
  data,
  onSaved,
}: {
  userId: string;
  data: {
    accounts: Array<{ id: string; code: string; name: string; opening_balance: number; opening_date: string }>;
    reserves: Array<{ id: string; name: string; amount: number; monthly_accrual: number | null; account_id: string }>;
    funds: Array<{ id: string; code: string; name: string; opening_balance: number; monthly_target: number }>;
    categories: Array<{ id: string; name: string; monthly_limit: number; sort_order: number }>;
    investments: Array<{ id: string; name: string; goal: string; monthly_amount: number; invested_total: number }>;
    plan: { planned_monthly_income: number; planned_car_emi: number; planned_maintenance: number; planned_tax_reserve: number; planned_corpus_contribution: number; planned_trip_contribution: number } | null;
    recurring: Array<{ id: string; name: string; amount: number; type: string; account_id: string; destination_account_id: string | null }>;
  };
  onSaved: () => void;
}) {
  const [accounts, setAccounts] = useState<AccountForm[]>(
    data.accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      opening_balance: String(a.opening_balance ?? 0),
      opening_date: a.opening_date ?? new Date().toISOString().slice(0, 10),
    })),
  );

  const [reserves, setReserves] = useState<ReserveForm[]>(
    data.reserves.map((r) => ({
      id: r.id,
      name: r.name,
      amount: String(r.amount ?? 0),
      monthly_accrual: r.monthly_accrual == null ? "" : String(r.monthly_accrual),
    })),
  );

  const [funds, setFunds] = useState<FundForm[]>(
    data.funds.map((f) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      opening_balance: String(f.opening_balance ?? 0),
      monthly_target: String(f.monthly_target ?? 0),
    })),
  );

  const [categories, setCategories] = useState<CategoryForm[]>(
    data.categories.map((c) => ({
      id: c.id,
      name: c.name,
      monthly_limit: String(c.monthly_limit ?? 0),
      sort_order: c.sort_order,
    })),
  );

  const [investments, setInvestments] = useState<InvestmentForm[]>(
    data.investments.map((i) => ({
      id: i.id,
      name: i.name,
      goal: i.goal,
      monthly_amount: String(i.monthly_amount ?? 0),
      invested_total: String(i.invested_total ?? 0),
    })),
  );

  const [plan, setPlan] = useState<PlanForm>({
    planned_monthly_income: String(data.plan?.planned_monthly_income ?? 0),
    planned_car_emi: String(data.plan?.planned_car_emi ?? 0),
    planned_maintenance: String(data.plan?.planned_maintenance ?? 0),
    planned_tax_reserve: String(data.plan?.planned_tax_reserve ?? 0),
    planned_corpus_contribution: String(data.plan?.planned_corpus_contribution ?? 0),
    planned_trip_contribution: String(data.plan?.planned_trip_contribution ?? 0),
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

  const accountByCode = Object.fromEntries(accounts.map((a) => [a.code, a]));

  // Running total for allocation section
  const categoriesTotal = categories.filter((c) => !c._deleted).reduce((s, c) => s + num(c.monthly_limit), 0);
  const allocated =
    categoriesTotal +
    num(plan.planned_car_emi) +
    num(plan.planned_maintenance) +
    num(plan.planned_tax_reserve) +
    num(plan.planned_corpus_contribution) +
    num(plan.planned_trip_contribution);
  const income = num(plan.planned_monthly_income);
  const remaining = income - allocated;

  async function save() {
    setBusy(true);
    try {
      // 1. Accounts
      for (const a of accounts) {
        const { error } = await supabase.from("accounts").update({
          opening_balance: num(a.opening_balance),
          opening_date: a.opening_date,
        }).eq("id", a.id);
        if (error) throw error;
      }

      // 2. Reserves
      for (const r of reserves) {
        const { error } = await supabase.from("reserves").update({
          amount: num(r.amount),
          monthly_accrual: r.monthly_accrual === "" ? null : num(r.monthly_accrual),
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

      // 4. Categories — upsert existing, insert new, delete removed
      for (const c of categories) {
        if (c._deleted && c.id) {
          const { error } = await supabase.from("categories").delete().eq("id", c.id);
          if (error) throw error;
          continue;
        }
        if (!c.name.trim()) continue;
        if (c.id) {
          const { error } = await supabase.from("categories").update({
            name: c.name.trim(),
            monthly_limit: num(c.monthly_limit),
            sort_order: c.sort_order,
          }).eq("id", c.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("categories").insert({
            user_id: userId,
            name: c.name.trim(),
            monthly_limit: num(c.monthly_limit),
            sort_order: c.sort_order,
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
        if (!inv.name.trim()) continue;
        const payload = {
          user_id: userId,
          name: inv.name.trim(),
          goal: inv.goal.trim() || "Unassigned",
          monthly_amount: num(inv.monthly_amount),
          invested_total: num(inv.invested_total),
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

      // 6. Budget plan — upsert singleton row
      const { error: planErr } = await supabase.from("budget_plan").upsert({
        user_id: userId,
        planned_monthly_income: num(plan.planned_monthly_income),
        planned_car_emi: num(plan.planned_car_emi),
        planned_maintenance: num(plan.planned_maintenance),
        planned_tax_reserve: num(plan.planned_tax_reserve),
        planned_corpus_contribution: num(plan.planned_corpus_contribution),
        planned_trip_contribution: num(plan.planned_trip_contribution),
      }, { onConflict: "user_id" });
      if (planErr) throw planErr;

      // 7. Recurring templates — Salary / Rent / HDFC→CUB
      const hdfc = accountByCode["HDFC"]?.id;
      const cub = accountByCode["CUB"]?.id;
      const sbi = accountByCode["SBI"]?.id;

      const specs: Array<{ name: string; amount: number; type: "income" | "transfer"; account_id: string | undefined; destination_account_id: string | null }> = [
        { name: "Salary", amount: num(recurring.salary), type: "income", account_id: hdfc, destination_account_id: null },
        { name: "Rent", amount: num(recurring.rent), type: "income", account_id: sbi, destination_account_id: null },
        { name: "HDFC→CUB", amount: num(recurring.hdfc_to_cub), type: "transfer", account_id: hdfc, destination_account_id: cub ?? null },
      ];
      for (const spec of specs) {
        if (!spec.account_id) continue;
        const existing = recurringByName[spec.name];
        if (existing) {
          const { error } = await supabase.from("recurring_templates").update({
            amount: spec.amount,
            account_id: spec.account_id,
            destination_account_id: spec.destination_account_id,
            type: spec.type,
          }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("recurring_templates").insert({
            user_id: userId,
            name: spec.name,
            amount: spec.amount,
            type: spec.type,
            account_id: spec.account_id,
            destination_account_id: spec.destination_account_id,
          });
          if (error) throw error;
        }
      }

      toast.success("Setup saved");
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Setup"
        description="Configure opening balances, monthly targets, budgets and recurring amounts. Update anytime."
      />

      {/* Section 1: Accounts */}
      <Section title="Account opening balances" subtitle="Balance and date each account started tracking from.">
        <div className="space-y-3">
          {accounts.map((a, i) => (
            <div key={a.id} className="grid grid-cols-1 md:grid-cols-[120px_1fr_1fr] gap-3 items-end">
              <div className="text-sm font-medium">{a.name}</div>
              <LabeledInput
                label="Opening balance (₹)"
                type="number" min="0" step="0.01"
                value={a.opening_balance}
                onChange={(v) => setAccounts((prev) => prev.map((x, idx) => idx === i ? { ...x, opening_balance: v } : x))}
              />
              <LabeledInput
                label="Opening date"
                type="date"
                value={a.opening_date}
                onChange={(v) => setAccounts((prev) => prev.map((x, idx) => idx === i ? { ...x, opening_date: v } : x))}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Section 2: Reserves */}
      <Section title="Reserves" subtitle="Off-limits portions of an account's balance.">
        <div className="space-y-3">
          {reserves.map((r, i) => {
            const isFloor = r.name.toLowerCase().includes("floor");
            return (
              <div key={r.id} className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr] gap-3 items-end">
                <div className="text-sm font-medium">{r.name}</div>
                <LabeledInput
                  label="Opening amount (₹)"
                  type="number" min="0" step="0.01"
                  value={r.amount}
                  onChange={(v) => setReserves((prev) => prev.map((x, idx) => idx === i ? { ...x, amount: v } : x))}
                />
                {isFloor ? (
                  <div className="text-xs text-muted-foreground">Static floor — no monthly accrual.</div>
                ) : (
                  <LabeledInput
                    label="Monthly accrual (₹)"
                    type="number" min="0" step="0.01"
                    value={r.monthly_accrual}
                    onChange={(v) => setReserves((prev) => prev.map((x, idx) => idx === i ? { ...x, monthly_accrual: v } : x))}
                  />
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Section 3: Funds */}
      <Section title="Goal funds" subtitle="Corpus and Trip funds held inside SBI.">
        <div className="space-y-3">
          {funds.map((f, i) => (
            <div key={f.id} className="grid grid-cols-1 md:grid-cols-[160px_1fr_1fr] gap-3 items-end">
              <div className="text-sm font-medium">{f.name}</div>
              <LabeledInput
                label="Opening balance (₹)"
                type="number" min="0" step="0.01"
                value={f.opening_balance}
                onChange={(v) => setFunds((prev) => prev.map((x, idx) => idx === i ? { ...x, opening_balance: v } : x))}
              />
              <LabeledInput
                label="Monthly target (₹)"
                type="number" min="0" step="0.01"
                value={f.monthly_target}
                onChange={(v) => setFunds((prev) => prev.map((x, idx) => idx === i ? { ...x, monthly_target: v } : x))}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Section 4: Planned monthly allocation */}
      <Section title="Planned monthly allocation" subtitle="How the full monthly income should be divided.">
        <div className="space-y-4">
          <LabeledInput
            label="Total planned monthly income (₹) — salary + net rent"
            type="number" min="0" step="0.01"
            value={plan.planned_monthly_income}
            onChange={(v) => setPlan((p) => ({ ...p, planned_monthly_income: v }))}
          />

          <div>
            <div className="text-sm font-medium mb-2">Category budget limits</div>
            <div className="space-y-2">
              {categories.map((c, i) => c._deleted ? null : (
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
                  { id: null, name: "", monthly_limit: "0", sort_order: (prev.at(-1)?.sort_order ?? 0) + 1 },
                ])}
              >
                <Plus className="h-4 w-4" /> Add category
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <LabeledInput
              label="Car EMI (₹)"
              type="number" min="0" step="0.01"
              value={plan.planned_car_emi}
              onChange={(v) => setPlan((p) => ({ ...p, planned_car_emi: v }))}
            />
            <LabeledInput
              label="Maintenance (₹)"
              type="number" min="0" step="0.01"
              value={plan.planned_maintenance}
              onChange={(v) => setPlan((p) => ({ ...p, planned_maintenance: v }))}
            />
            <LabeledInput
              label="Tax Reserve accrual (₹)"
              hint="Overrides Section 2 for planning purposes."
              type="number" min="0" step="0.01"
              value={plan.planned_tax_reserve}
              onChange={(v) => setPlan((p) => ({ ...p, planned_tax_reserve: v }))}
            />
            <div />
            <LabeledInput
              label="Corpus Fund contribution (₹)"
              hint="Overrides Section 3 monthly target."
              type="number" min="0" step="0.01"
              value={plan.planned_corpus_contribution}
              onChange={(v) => setPlan((p) => ({ ...p, planned_corpus_contribution: v }))}
            />
            <LabeledInput
              label="Trip Fund contribution (₹)"
              hint="Overrides Section 3 monthly target."
              type="number" min="0" step="0.01"
              value={plan.planned_trip_contribution}
              onChange={(v) => setPlan((p) => ({ ...p, planned_trip_contribution: v }))}
            />
          </div>

          <Separator />

          <div className="rounded-md border border-border p-4 bg-muted/30">
            <div className="grid grid-cols-2 gap-y-1.5 text-sm tabular-nums">
              <div className="text-muted-foreground">Planned income</div>
              <div className="text-right">{formatINR(income)}</div>
              <div className="text-muted-foreground">Allocated (categories + fixed + reserve + funds)</div>
              <div className="text-right">{formatINR(allocated)}</div>
              <div className="pt-2 font-medium">Unallocated remainder</div>
              <div className={"pt-2 text-right font-medium " + (remaining < 0 ? "text-destructive" : "text-success")}>
                {formatINR(remaining)}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Section 5: Investments */}
      <Section title="Investments (SIPs)" subtitle="Mutual fund SIPs sourced from HDFC.">
        <div className="space-y-2">
          {investments.map((inv, i) => inv._deleted ? null : (
            <div key={inv.id ?? `new-inv-${i}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_140px_140px_40px] gap-2 items-center">
              <Input
                placeholder="Fund name (e.g. Parag Parikh Flexi Cap)"
                value={inv.name}
                onChange={(e) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
              />
              <Input
                placeholder="Goal (e.g. Retirement)"
                value={inv.goal}
                onChange={(e) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, goal: e.target.value } : x))}
              />
              <Input
                type="number" min="0" step="0.01" placeholder="Monthly SIP"
                value={inv.monthly_amount}
                onChange={(e) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, monthly_amount: e.target.value } : x))}
              />
              <Input
                type="number" min="0" step="0.01" placeholder="Invested so far"
                value={inv.invested_total}
                onChange={(e) => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, invested_total: e.target.value } : x))}
              />
              <Button
                type="button" variant="ghost" size="icon"
                onClick={() => setInvestments((prev) => prev.map((x, idx) => idx === i ? { ...x, _deleted: true } : x))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button" variant="outline" size="sm" className="gap-1.5"
            onClick={() => setInvestments((prev) => [
              ...prev,
              { id: null, name: "", goal: "", monthly_amount: "0", invested_total: "0" },
            ])}
          >
            <Plus className="h-4 w-4" /> Add investment
          </Button>
        </div>
      </Section>

      {/* Section 6: Recurring templates */}
      <Section title="Recurring monthly amounts" subtitle="Amounts used by the recurring template rows.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <LabeledInput
            label="Salary → HDFC (₹)"
            type="number" min="0" step="0.01"
            value={recurring.salary}
            onChange={(v) => setRecurring((r) => ({ ...r, salary: v }))}
          />
          <LabeledInput
            label="Rent → SBI (₹)"
            type="number" min="0" step="0.01"
            value={recurring.rent}
            onChange={(v) => setRecurring((r) => ({ ...r, rent: v }))}
          />
          <LabeledInput
            label="HDFC → CUB transfer (₹)"
            type="number" min="0" step="0.01"
            value={recurring.hdfc_to_cub}
            onChange={(v) => setRecurring((r) => ({ ...r, hdfc_to_cub: v }))}
          />
        </div>
      </Section>

      <div className="sticky bottom-4 mt-8 flex justify-end">
        <Button onClick={save} disabled={busy} size="lg">
          {busy ? "Saving…" : "Save setup"}
        </Button>
      </div>
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
      <Input
        type={type} min={min} step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint ? <div className="text-[11px] text-muted-foreground mt-1">{hint}</div> : null}
    </div>
  );
}