import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

type SurplusPay = { id: string; date: string; amount: number; description: string | null; surplus_bucket: string | null };
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, type AccountRow } from "@/lib/finance-db";
import { fetchClosures, fetchSurplusEntries } from "@/lib/month-close";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/surplus")({
  head: () => ({
    meta: [
      { title: "Surplus history — Ledger" },
      {
        name: "description",
        content: "Every closed month, its bucket surpluses and deficits, and where the unspent money ended up.",
      },
      { property: "og:title", content: "Surplus history — Ledger" },
      {
        property: "og:description",
        content: "Track unspent money across closed months and which account it now sits in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SurplusPage,
});

function SurplusPage() {
  const { session, user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  const q = useQuery({
    queryKey: ["surplus-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [closures, entries, accounts, pays] = await Promise.all([
        fetchClosures(),
        fetchSurplusEntries(),
        supabase.from("accounts").select("id,code,name,role,opening_balance").neq("code","CCARD").order("code"),
        supabase
          .from("transactions")
          .select("id,date,amount,description,surplus_bucket")
          .eq("type", "surplus_payment")
          .not("surplus_bucket", "is", null)
          .order("date"),
      ]);
      if (accounts.error) throw accounts.error;
      if (pays.error) throw pays.error;
      return {
        closures,
        entries,
        accounts: (accounts.data ?? []) as AccountRow[],
        payments: (pays.data ?? []) as SurplusPay[],
      };
    },
  });

  const qc = useQueryClient();
  const deletePayment = async (p: SurplusPay) => {
    if (!window.confirm(`Remove this ${formatINR(Number(p.amount))} payment from ${p.surplus_bucket} surplus? This cannot be undone.`)) return;
    const { error } = await supabase.from("transactions").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment removed");
    qc.invalidateQueries({ queryKey: ["surplus-history"] });
    qc.invalidateQueries({ queryKey: ["finance"] });
  };

  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  const accountName = (id: string | null) =>
    q.data?.accounts.find((a) => a.id === id)?.name ?? "—";

  const totals = useMemo(() => {
    const entries = q.data?.entries ?? [];
    const byAccount: Record<string, number> = {};
    let total = 0;
    for (const e of entries) {
      const s = Number(e.surplus_amount);
      if (s <= 0) continue;
      total += s;
      const dest = e.destination_account_id ?? e.source_account_id;
      if (dest) byAccount[dest] = (byAccount[dest] ?? 0) + s;
    }
    return { total, byAccount };
  }, [q.data]);

  // Each payment belongs to the latest closed month on/before its date (else the earliest).
  const ledger = useMemo(() => {
    const closures = (q.data?.closures ?? []).slice().sort((a, b) => a.month.localeCompare(b.month));
    const entries = q.data?.entries ?? [];
    const payments = q.data?.payments ?? [];
    const paysByClosure: Record<string, SurplusPay[]> = {};
    for (const p of payments) {
      let target = closures[0];
      for (const c of closures) if (c.month.slice(0, 10) <= p.date) target = c;
      if (!target) continue;
      (paysByClosure[target.id] ??= []).push(p);
    }
    const byClosure: Record<string, { monthTotal: number; payTotal: number; balanceAfter: number }> = {};
    let running = 0;
    let paidTotal = 0;
    for (const c of closures) {
      const monthTotal = entries.filter((e) => e.closure_id === c.id).reduce((s, r) => s + Number(r.surplus_amount), 0);
      const payTotal = (paysByClosure[c.id] ?? []).reduce((s, p) => s + Number(p.amount), 0);
      paidTotal += payTotal;
      running += monthTotal - payTotal;
      byClosure[c.id] = { monthTotal, payTotal, balanceAfter: running };
    }
    return { byClosure, paysByClosure, remaining: running, paidTotal };
  }, [q.data]);

  if (loading || !session) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (q.isLoading || !q.data) return <div className="text-sm text-muted-foreground">Loading surplus history…</div>;

  const { closures, entries, accounts } = q.data;

  return (
    <div>
      <PageHeader
        title="Surplus"
        description="Unspent money from every closed month, and which account it ended up in."
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-4 mb-8">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Surplus remaining
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{formatINR(ledger.remaining)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              across {closures.length} closed month{closures.length === 1 ? "" : "s"}
              {ledger.paidTotal > 0 ? ` · ${formatINR(ledger.paidTotal)} paid out` : ""}
            </div>
          </CardContent>
        </Card>
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardContent className="pt-5 pb-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">In {a.name}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {formatINR(totals.byAccount[a.id] ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">accumulated surplus</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {closures.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground text-center">
            No months closed yet. Close a month from the Dashboard to start building history.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {closures.map((c) => {
            const rows = entries.filter((e) => e.closure_id === c.id);
            const monthLabel = new Date(c.month).toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            });
            const info = ledger.byClosure[c.id] ?? { monthTotal: 0, payTotal: 0, balanceAfter: 0 };
            const { monthTotal, payTotal, balanceAfter } = info;
            const net = monthTotal - payTotal;
            const pays = ledger.paysByClosure[c.id] ?? [];
            const byDest: Record<string, number> = {};
            for (const r of rows) {
              const s = Number(r.surplus_amount);
              if (s <= 0) continue;
              const d = r.destination_account_id ?? r.source_account_id;
              if (d) byDest[d] = (byDest[d] ?? 0) + s;
            }
            const isOpen = openMonths[c.id] ?? true;
            return (
              <Card key={c.id}>
                <CardContent className="pt-4 pb-4">
                  <button
                    type="button"
                    onClick={() => setOpenMonths((s) => ({ ...s, [c.id]: !isOpen }))}
                    className="w-full flex items-center justify-between gap-4 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{monthLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          Closed {new Date(c.closed_at).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-6 shrink-0">
                      <div className="text-right">
                        <div
                          className={
                            "text-sm font-semibold tabular-nums " +
                            (net > 0 ? "text-success" : net < 0 ? "text-destructive" : "")
                          }
                        >
                          {formatINR(net)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          net for month{payTotal > 0 ? ` (${formatINR(monthTotal)} − ${formatINR(payTotal)} paid)` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">{formatINR(balanceAfter)}</div>
                        <div className="text-xs text-muted-foreground">balance after</div>
                      </div>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="mt-4">
                      <div className="rounded-md border border-border overflow-x-auto">
                        <table className="w-full text-sm min-w-[720px]">
                          <thead className="bg-muted/50 text-xs text-muted-foreground">
                            <tr>
                              <th className="text-left font-medium px-3 py-2">Bucket</th>
                              <th className="text-right font-medium px-3 py-2">Planned</th>
                              <th className="text-right font-medium px-3 py-2">Actual</th>
                              <th className="text-right font-medium px-3 py-2">Surplus</th>
                              <th className="text-left font-medium px-3 py-2">From</th>
                              <th className="text-left font-medium px-3 py-2">To</th>
                              <th className="text-left font-medium px-3 py-2">Note</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {rows.map((r) => {
                              const s = Number(r.surplus_amount);
                              return (
                                <tr key={r.id}>
                                  <td className="px-3 py-2">{r.bucket}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatINR(Number(r.planned_amount))}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatINR(Number(r.actual_amount))}
                                  </td>
                                  <td
                                    className={
                                      "px-3 py-2 text-right tabular-nums font-medium " +
                                      (s > 0 ? "text-success" : s < 0 ? "text-destructive" : "text-muted-foreground")
                                    }
                                  >
                                    {formatINR(s)}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {accountName(r.source_account_id)}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {s > 0
                                      ? r.transfer_transaction_id
                                        ? `${accountName(r.destination_account_id)} · transferred`
                                        : `${accountName(r.destination_account_id ?? r.source_account_id)} · stayed`
                                      : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {r.destination_note || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {pays.length > 0 ? (
                        <div className="mt-3 rounded-md border border-border overflow-x-auto">
                          <table className="w-full text-sm min-w-[520px]">
                            <thead className="bg-muted/50 text-xs text-muted-foreground">
                              <tr>
                                <th className="text-left font-medium px-3 py-2">Date</th>
                                <th className="text-left font-medium px-3 py-2">Paid from surplus</th>
                                <th className="text-left font-medium px-3 py-2">Description</th>
                                <th className="text-right font-medium px-3 py-2">Amount</th>
                                <th className="px-3 py-2" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {pays.map((p) => (
                                <tr key={p.id}>
                                  <td className="px-3 py-2 text-muted-foreground">{p.date}</td>
                                  <td className="px-3 py-2">{p.surplus_bucket}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{p.description || "—"}</td>
                                  <td className="px-3 py-2 text-right tabular-nums font-medium text-destructive">
                                    −{formatINR(Number(p.amount))}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button
                                      type="button"
                                      aria-label="Delete payment"
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() => deletePayment(p)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                      <div className="mt-3 text-xs text-muted-foreground">
                        {accounts
                          .map((a) => `${formatINR(byDest[a.id] ?? 0)} in ${a.name}`)
                          .join(" · ")}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
