import { createFileRoute } from "@tanstack/react-router";
import { sips, formatINR } from "@/lib/finance-data";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/investments")({
  head: () => ({
    meta: [
      { title: "Investments — Ledger" },
      { name: "description", content: "Mutual fund SIPs by long-term goal." },
    ],
  }),
  component: InvestmentsPage,
});

function InvestmentsPage() {
  const totalMonthly = sips.reduce((s, x) => s + x.monthly, 0);
  const totalInvested = sips.reduce((s, x) => s + x.invested, 0);
  return (
    <div>
      <PageHeader title="Investments" description="Mutual fund SIPs sourced from HDFC, tagged to long-term goals." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Monthly SIP</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{formatINR(totalMonthly)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total invested</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{formatINR(totalInvested)}</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Fund</th>
                <th className="px-5 py-3 font-medium">Goal</th>
                <th className="px-5 py-3 font-medium text-right">Monthly</th>
                <th className="px-5 py-3 font-medium text-right">Invested</th>
              </tr>
            </thead>
            <tbody>
              {sips.map((s) => (
                <tr key={s.name} className="border-t border-border">
                  <td className="px-5 py-3.5 font-medium">{s.name}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="secondary" className="font-normal">{s.goal}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{formatINR(s.monthly)}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums">{formatINR(s.invested)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}