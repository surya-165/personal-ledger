import { createFileRoute } from "@tanstack/react-router";
import { accounts, formatINR } from "@/lib/finance-data";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Ledger" },
      { name: "description", content: "Balances and reserved portions across HDFC, CUB, and SBI." },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  return (
    <div>
      <PageHeader title="Accounts" description="Each account's balance, the reserved portion, and what's actually usable." />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {accounts.map((a) => {
          const usable = a.balance - a.reserved;
          const reservedPct = a.balance > 0 ? (a.reserved / a.balance) * 100 : 0;
          return (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex items-baseline justify-between">
                  <CardTitle className="text-base font-medium">{a.name}</CardTitle>
                  <span className="text-xs text-muted-foreground">{a.role}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums tracking-tight">
                  {formatINR(a.balance)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Total balance</div>
                <div className="mt-5 h-2 w-full rounded-full bg-muted overflow-hidden flex">
                  <div className="h-full bg-primary/70" style={{ width: `${100 - reservedPct}%` }} />
                  <div className="h-full bg-warning/60" style={{ width: `${reservedPct}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Usable</div>
                    <div className="tabular-nums font-medium">{formatINR(usable)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Reserved</div>
                    <div className="tabular-nums font-medium">{formatINR(a.reserved)}</div>
                  </div>
                </div>
                {a.reservedBreakdown.length > 0 ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Reserved breakdown
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {a.reservedBreakdown.map((r) => (
                        <li key={r.label} className="flex justify-between">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span className="tabular-nums">{formatINR(r.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}