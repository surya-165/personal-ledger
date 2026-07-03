import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchAll, formatINR, type TxType, type AccountRow, type CategoryRow, type FundRow, type ReserveRow, type TxRow } from "@/lib/finance-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type TplId = "salary" | "rent" | "hdfc_cub" | "hdfc_sbi";

interface Ctx {
  accounts: AccountRow[];
  categories: CategoryRow[];
  funds: FundRow[];
  reserves: ReserveRow[];
  transactions: TxRow[];
  plan: {
    planned_maintenance: number;
    planned_car_emi: number;
    planned_tax_reserve: number;
    planned_corpus_contribution: number;
    planned_trip_contribution: number;
  } | null;
  recurring: Record<string, { amount: number }>;
}

const TAG = (id: TplId) => `[Recurring:${id}]`;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function findByName<T extends { name: string }>(list: T[], needle: string): T | undefined {
  const n = needle.toLowerCase();
  return list.find((x) => x.name.toLowerCase().includes(n));
}

export function RecurringPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["recurring-ctx", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Ctx> => {
      const [core, plan, recurring] = await Promise.all([
        fetchAll(user!.id),
        supabase.from("budget_plan").select("planned_maintenance,planned_car_emi,planned_tax_reserve,planned_corpus_contribution,planned_trip_contribution").maybeSingle(),
        supabase.from("recurring_templates").select("name,amount"),
      ]);
      if (plan.error) throw plan.error;
      if (recurring.error) throw recurring.error;
      const map: Record<string, { amount: number }> = {};
      for (const r of recurring.data ?? []) map[r.name] = { amount: Number(r.amount) };
      return { ...core, plan: plan.data as Ctx["plan"], recurring: map };
    },
  });

  const ctx = q.data;
  const [open, setOpen] = useState<TplId | null>(null);

  const ranThisMonth = useMemo(() => {
    const key = monthKey(new Date());
    const set = new Set<TplId>();
    if (!ctx) return set;
    for (const t of ctx.transactions) {
      if (!t.date.startsWith(key)) continue;
      const d = t.description || "";
      (["salary", "rent", "hdfc_cub", "hdfc_sbi"] as TplId[]).forEach((id) => {
        if (d.includes(TAG(id))) set.add(id);
      });
    }
    return set;
  }, [ctx]);

  if (!ctx) return null;

  const templates: Array<{ id: TplId; title: string; subtitle: string; defaultAmount: number }> = [
    { id: "salary", title: "Salary credit", subtitle: "→ HDFC", defaultAmount: ctx.recurring["Salary"]?.amount ?? 0 },
    { id: "rent", title: "Rent credit + split", subtitle: "→ SBI · auto-splits maintenance, tax reserve, EMI, funds", defaultAmount: ctx.recurring["Rent"]?.amount ?? 0 },
    { id: "hdfc_cub", title: "HDFC → CUB transfer", subtitle: "monthly spending allowance", defaultAmount: ctx.recurring["HDFC→CUB"]?.amount ?? 0 },
    { id: "hdfc_sbi", title: "HDFC → SBI transfer", subtitle: "manual top-up", defaultAmount: 0 },
  ];

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-medium">This month's recurring</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((t) => {
            const done = ranThisMonth.has(t.id);
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {t.title}
                    {done ? <Badge variant="secondary" className="font-normal"><Check className="h-3 w-3 mr-1" />done</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{t.subtitle}</div>
                  <div className="text-xs tabular-nums text-muted-foreground mt-0.5">Default {formatINR(t.defaultAmount)}</div>
                </div>
                <Button size="sm" variant={done ? "outline" : "default"} onClick={() => setOpen(t.id)}>
                  {done ? "Run again" : "Confirm"}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>

      {open ? (
        <ConfirmDialog
          templateId={open}
          ctx={ctx}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            qc.invalidateQueries({ queryKey: ["finance", user!.id] });
            qc.invalidateQueries({ queryKey: ["recurring-ctx", user!.id] });
          }}
        />
      ) : null}
    </Card>
  );
}

interface PreviewRow {
  type: TxType;
  amount: number;
  account_id: string;
  destination_account_id?: string | null;
  category_id?: string | null;
  fund_id?: string | null;
  reserve_id?: string | null;
  description: string;
  label: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ConfirmDialog({
  templateId, ctx, onClose, onSaved,
}: { templateId: TplId; ctx: Ctx; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const hdfc = ctx.accounts.find((a) => a.code === "HDFC");
  const cub = ctx.accounts.find((a) => a.code === "CUB");
  const sbi = ctx.accounts.find((a) => a.code === "SBI");
  const corpus = ctx.funds.find((f) => f.code === "corpus");
  const trip = ctx.funds.find((f) => f.code === "trip");
  const taxReserve = findByName(ctx.reserves, "tax");
  const maintCat = findByName(ctx.categories, "maintenance");
  const emiCat = findByName(ctx.categories, "car emi") ?? findByName(ctx.categories, "emi");

  const defaults: Record<TplId, number> = {
    salary: ctx.recurring["Salary"]?.amount ?? 0,
    rent: ctx.recurring["Rent"]?.amount ?? 0,
    hdfc_cub: ctx.recurring["HDFC→CUB"]?.amount ?? 0,
    hdfc_sbi: 0,
  };

  const [amount, setAmount] = useState<string>(String(defaults[templateId] || ""));
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  // rent-split overrides
  const [maintAmt, setMaintAmt] = useState<string>(String(ctx.plan?.planned_maintenance ?? 0));
  const [emiAmt, setEmiAmt] = useState<string>(String(ctx.plan?.planned_car_emi ?? 0));
  const [taxAmt, setTaxAmt] = useState<string>(String(ctx.plan?.planned_tax_reserve ?? taxReserve?.monthly_accrual ?? 0));
  const [corpusAmt, setCorpusAmt] = useState<string>(String(ctx.plan?.planned_corpus_contribution ?? corpus?.monthly_target ?? 0));
  const [tripAmt, setTripAmt] = useState<string>(String(ctx.plan?.planned_trip_contribution ?? trip?.monthly_target ?? 0));

  const amt = Number(amount) || 0;
  const m = Number(maintAmt) || 0;
  const e = Number(emiAmt) || 0;
  const t = Number(taxAmt) || 0;
  const c = Number(corpusAmt) || 0;
  const tr = Number(tripAmt) || 0;

  const rows: PreviewRow[] = useMemo(() => {
    if (templateId === "salary") {
      if (!hdfc) return [];
      return [{
        type: "income", amount: amt, account_id: hdfc.id,
        description: `Salary ${TAG("salary")}`,
        label: "Salary → HDFC",
      }];
    }
    if (templateId === "hdfc_cub") {
      if (!hdfc || !cub) return [];
      return [{
        type: "transfer", amount: amt, account_id: hdfc.id, destination_account_id: cub.id,
        description: `HDFC → CUB ${TAG("hdfc_cub")}`,
        label: "Transfer HDFC → CUB",
      }];
    }
    if (templateId === "hdfc_sbi") {
      if (!hdfc || !sbi) return [];
      return [{
        type: "transfer", amount: amt, account_id: hdfc.id, destination_account_id: sbi.id,
        description: `HDFC → SBI ${TAG("hdfc_sbi")}`,
        label: "Transfer HDFC → SBI",
      }];
    }
    // rent + split
    if (!sbi || !hdfc) return [];
    const out: PreviewRow[] = [];
    out.push({
      type: "income", amount: amt, account_id: sbi.id,
      description: `Rent ${TAG("rent")}`,
      label: "Rent income → SBI",
    });
    if (m > 0 && maintCat) out.push({
      type: "expense", amount: m, account_id: sbi.id, category_id: maintCat.id,
      description: `Apartment maintenance ${TAG("rent")}`,
      label: `Maintenance expense (${maintCat.name}) → SBI`,
    });
    if (t > 0 && taxReserve) out.push({
      type: "reserve_accrual", amount: t, account_id: taxReserve.account_id, reserve_id: taxReserve.id,
      description: `Tax reserve accrual ${TAG("rent")}`,
      label: `Tax reserve accrual (earmark ${formatINR(t)})`,
    });
    if (e > 0 && emiCat) out.push({
      type: "expense", amount: e, account_id: sbi.id, category_id: emiCat.id,
      description: `Car EMI ${TAG("rent")}`,
      label: `Car EMI expense (${emiCat.name}) → SBI`,
    });
    // Residual cash in SBI available for funds (tax reserve is earmarked)
    const residual = amt - m - t - e;
    const fundTotal = c + tr;
    const topUp = Math.max(0, fundTotal - residual);
    if (topUp > 0) out.push({
      type: "transfer", amount: topUp, account_id: hdfc.id, destination_account_id: sbi.id,
      description: `HDFC → SBI top-up for fund contributions ${TAG("rent")}`,
      label: `Auto HDFC → SBI top-up ${formatINR(topUp)}`,
    });
    if (c > 0 && corpus) out.push({
      type: "fund_contribution", amount: c, account_id: sbi.id, fund_id: corpus.id,
      description: `Corpus fund contribution ${TAG("rent")}`,
      label: "Corpus fund contribution ← SBI",
    });
    if (tr > 0 && trip) out.push({
      type: "fund_contribution", amount: tr, account_id: sbi.id, fund_id: trip.id,
      description: `Trip fund contribution ${TAG("rent")}`,
      label: "Trip fund contribution ← SBI",
    });
    return out;
  }, [templateId, amt, m, e, t, c, tr, hdfc, cub, sbi, corpus, trip, maintCat, emiCat, taxReserve]);

  const isRent = templateId === "rent";
  const residual = amt - m - t - e;
  const fundTotal = c + tr;
  const topUp = Math.max(0, fundTotal - residual);

  async function save() {
    if (!user) return;
    if (rows.length === 0) { toast.error("Nothing to save"); return; }
    setBusy(true);
    const payload = rows.map((r) => ({
      user_id: user.id,
      date,
      type: r.type,
      amount: r.amount,
      account_id: r.account_id,
      destination_account_id: r.destination_account_id ?? null,
      category_id: r.category_id ?? null,
      fund_id: r.fund_id ?? null,
      reserve_id: r.reserve_id ?? null,
      description: r.description,
      payment_mode: null,
    }));
    const { error } = await supabase.from("transactions").insert(payload as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Recorded ${rows.length} transaction${rows.length === 1 ? "" : "s"}`);
    onSaved();
  }

  const titleMap: Record<TplId, string> = {
    salary: "Confirm salary credit",
    rent: "Confirm rent credit + monthly split",
    hdfc_cub: "Confirm HDFC → CUB transfer",
    hdfc_sbi: "Confirm HDFC → SBI transfer",
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titleMap[templateId]}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Amount (₹)</label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(ev) => setAmount(ev.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Date</label>
            <Input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
          </div>
        </div>

        {isRent ? (
          <div className="mt-2 space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Split amounts</div>
            <div className="grid grid-cols-2 gap-3">
              <SmallField label="Maintenance" v={maintAmt} setV={setMaintAmt} />
              <SmallField label="Car EMI" v={emiAmt} setV={setEmiAmt} />
              <SmallField label="Tax reserve accrual" v={taxAmt} setV={setTaxAmt} />
              <SmallField label="Corpus fund" v={corpusAmt} setV={setCorpusAmt} />
              <SmallField label="Trip fund" v={tripAmt} setV={setTripAmt} />
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              SBI residual after maintenance, tax earmark & EMI: <span className="tabular-nums text-foreground">{formatINR(residual)}</span> ·
              Fund contributions need <span className="tabular-nums text-foreground">{formatINR(fundTotal)}</span>
              {topUp > 0 ? <> · auto top-up <span className="tabular-nums text-foreground">{formatINR(topUp)}</span></> : null}
            </div>
          </div>
        ) : null}

        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Preview — {rows.length} row{rows.length === 1 ? "" : "s"}</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="tabular-nums text-muted-foreground">{formatINR(r.amount)}</span>
              </li>
            ))}
            {rows.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted-foreground">
                Missing configuration — check that accounts, funds, tax reserve and Maintenance/Car EMI categories exist in Setup.
              </li>
            ) : null}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || rows.length === 0}>
            {busy ? "Saving…" : `Confirm ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SmallField({ label, v, setV }: { label: string; v: string; setV: (s: string) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <Input type="number" min="0" step="0.01" value={v} onChange={(e) => setV(e.target.value)} />
    </div>
  );
}