import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  transactions,
  categories,
  accounts,
  transactionTypeLabel,
  formatINR,
  type TransactionType,
  type AccountId,
} from "@/lib/finance-data";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Ledger" },
      { name: "description", content: "Filterable log of every money movement." },
    ],
  }),
  component: TransactionsPage,
});

const ALL = "__all__";

function TransactionsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState<string>(ALL);
  const [account, setAccount] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (type !== ALL && t.type !== (type as TransactionType)) return false;
      if (account !== ALL && t.account !== (account as AccountId)) return false;
      if (category !== ALL && t.category !== category) return false;
      return true;
    });
  }, [from, to, type, account, category]);

  return (
    <div>
      <PageHeader title="Transactions" description="Every income, expense, transfer, contribution, and accrual." />
      <Card className="mb-5">
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Type</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {(Object.keys(transactionTypeLabel) as TransactionType[]).map((k) => (
                  <SelectItem key={k} value={k}>{transactionTypeLabel[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Account</label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Description</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Account</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-5 py-3.5 tabular-nums text-muted-foreground whitespace-nowrap">{t.date}</td>
                  <td className="px-5 py-3.5">
                    {t.description}
                    {t.counterAccount ? (
                      <span className="text-xs text-muted-foreground"> → {t.counterAccount}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant="secondary" className="font-normal whitespace-nowrap">
                      {transactionTypeLabel[t.type]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">{t.account}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{t.category ?? "—"}</td>
                  <td
                    className={
                      "px-5 py-3.5 text-right tabular-nums font-medium whitespace-nowrap " +
                      (t.amount >= 0 ? "text-success" : "text-foreground")
                    }
                  >
                    {formatINR(t.amount)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No transactions match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}