import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR, type AccountRow, type Bucket } from "@/lib/finance-db";
import {
  ALL_BUCKETS,
  bucketDefaultDestCode,
  bucketSourceCode,
  closeMonth,
  type CloseBucketInput,
} from "@/lib/month-close";

export interface BucketFigure {
  bucket: Bucket;
  planned: number;
  actual: number;
}

export function CloseMonthDialog({
  open,
  onOpenChange,
  userId,
  month,
  monthLabel,
  lastDay,
  figures,
  accounts,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  month: string;
  monthLabel: string;
  lastDay: string;
  figures: BucketFigure[];
  accounts: AccountRow[];
}) {
  const qc = useQueryClient();
  const accountByCode = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.code, a])) as Record<string, AccountRow>,
    [accounts],
  );
  const accountName = (id: string | null) =>
    accounts.find((a) => a.id === id)?.name ?? "—";

  const rows = useMemo(
    () =>
      ALL_BUCKETS.map((b) => {
        const f = figures.find((x) => x.bucket === b) ?? { bucket: b, planned: 0, actual: 0 };
        return { ...f, bucket: b, surplus: f.planned - f.actual };
      }),
    [figures],
  );

  const [dest, setDest] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const destFor = (b: Bucket) =>
    dest[b] ?? accountByCode[bucketDefaultDestCode[b]]?.id ?? "";
  const sourceFor = (b: Bucket) => accountByCode[bucketSourceCode[b]]?.id ?? null;
  const amountFor = (r: { bucket: Bucket; surplus: number }) => {
    const raw = amounts[r.bucket];
    if (raw === undefined) return r.surplus;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const surplusRows = rows.filter((r) => r.surplus > 0);
  const transfers = surplusRows.filter(
    (r) => sourceFor(r.bucket) !== destFor(r.bucket) && amountFor(r) > 0,
  );
  const staying = surplusRows.filter((r) => sourceFor(r.bucket) === destFor(r.bucket));

  const totals = rows.reduce(
    (acc, r) => ({
      planned: acc.planned + r.planned,
      actual: acc.actual + r.actual,
      surplus: acc.surplus + r.surplus,
    }),
    { planned: 0, actual: 0, surplus: 0 },
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const buckets: CloseBucketInput[] = rows.map((r) => ({
        bucket: r.bucket,
        planned: r.planned,
        actual: r.actual,
        surplus: r.surplus,
        transferAmount: r.surplus > 0 ? amountFor(r) : 0,
        sourceAccountId: sourceFor(r.bucket),
        destinationAccountId: r.surplus > 0 ? destFor(r.bucket) || null : null,
        note: notes[r.bucket] ?? "",
      }));
      return closeMonth({ userId, month, monthLabel, lastDay, buckets });
    },
    onSuccess: (res) => {
      toast.success(
        `${monthLabel} closed · ${res.transfersCreated} transfer${res.transfersCreated === 1 ? "" : "s"} created`,
      );
      qc.invalidateQueries({ queryKey: ["finance"] });
      qc.invalidateQueries({ queryKey: ["month-closures"] });
      qc.invalidateQueries({ queryKey: ["surplus-entries"] });
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(`Could not close month: ${(e as Error).message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Close {monthLabel}</DialogTitle>
          <DialogDescription>
            Review the month, decide where each surplus goes, then confirm. A month can only be
            closed once.
          </DialogDescription>
        </DialogHeader>

        {/* Section 1 — summary */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Month summary
          </h3>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Bucket</th>
                  <th className="text-right font-medium px-3 py-2">Planned</th>
                  <th className="text-right font-medium px-3 py-2">Actual</th>
                  <th className="text-right font-medium px-3 py-2">Surplus / Deficit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.bucket}>
                    <td className="px-3 py-2">{r.bucket}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.planned)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(r.actual)}</td>
                    <td
                      className={
                        "px-3 py-2 text-right tabular-nums font-medium " +
                        (r.surplus > 0 ? "text-success" : r.surplus < 0 ? "text-destructive" : "text-muted-foreground")
                      }
                    >
                      {formatINR(r.surplus)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-muted/30">
                <tr className="font-medium">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(totals.planned)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatINR(totals.actual)}</td>
                  <td
                    className={
                      "px-3 py-2 text-right tabular-nums " +
                      (totals.surplus > 0 ? "text-success" : totals.surplus < 0 ? "text-destructive" : "")
                    }
                  >
                    {formatINR(totals.surplus)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* Section 2 — allocation */}
        <section className="mt-2">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Surplus allocation
          </h3>
          <div className="space-y-3">
            {rows.map((r) => {
              if (r.surplus < 0) {
                return (
                  <div key={r.bucket} className="rounded-md border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{r.bucket}</span>{" "}
                    <span className="text-destructive/80">
                      Overspent by {formatINR(Math.abs(r.surplus))}
                    </span>
                  </div>
                );
              }
              if (r.surplus === 0) {
                return (
                  <div key={r.bucket} className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{r.bucket}</span> · Fully utilised
                  </div>
                );
              }
              const src = sourceFor(r.bucket);
              const dst = destFor(r.bucket);
              return (
                <div key={r.bucket} className="rounded-md border border-border p-3">
                  <div className="text-sm font-medium mb-2">
                    {r.bucket} surplus of{" "}
                    <span className="tabular-nums text-success">{formatINR(r.surplus)}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Source account</Label>
                      <div className="mt-1 h-9 flex items-center rounded-md border border-border bg-muted/40 px-3 text-sm">
                        {accountName(src)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Destination account</Label>
                      <Select value={dst} onValueChange={(v) => setDest((s) => ({ ...s, [r.bucket]: v }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {src === dst ? (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Staying in {accountName(src)} — no transfer will be created.
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground">
                        Transfer amount (₹) — defaults to the calculated surplus
                      </Label>
                      <Input
                        className="mt-1 tabular-nums"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={amounts[r.bucket] ?? String(r.surplus)}
                        onChange={(e) => setAmounts((s) => ({ ...s, [r.bucket]: e.target.value }))}
                      />
                      {amountFor(r) !== r.surplus ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Calculated surplus was {formatINR(r.surplus)}.{" "}
                          <button
                            type="button"
                            className="underline"
                            onClick={() =>
                              setAmounts((s) => {
                                const n = { ...s };
                                delete n[r.bucket];
                                return n;
                              })
                            }
                          >
                            Reset
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div className="mt-3">
                    <Label className="text-xs text-muted-foreground">
                      What did you do with this surplus? (optional)
                    </Label>
                    <Input
                      className="mt-1"
                      value={notes[r.bucket] ?? ""}
                      onChange={(e) => setNotes((s) => ({ ...s, [r.bucket]: e.target.value }))}
                      placeholder="e.g. Transferred to HDFC for stock purchase"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3 — confirm */}
        <section className="mt-2">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Confirm and close
          </h3>
          <div className="rounded-md border border-border p-3 text-sm space-y-1">
            {transfers.length === 0 && staying.length === 0 ? (
              <div className="text-muted-foreground">No surplus this month — nothing will move.</div>
            ) : null}
            {transfers.map((r) => (
              <div key={r.bucket}>
                Transfer <span className="tabular-nums font-medium">{formatINR(amountFor(r))}</span> from{" "}
                {accountName(sourceFor(r.bucket))} to {accountName(destFor(r.bucket))} — {r.bucket} surplus
              </div>
            ))}
            {staying.map((r) => (
              <div key={r.bucket} className="text-muted-foreground">
                <span className="tabular-nums">{formatINR(r.surplus)}</span> stays in{" "}
                {accountName(sourceFor(r.bucket))} — {r.bucket} surplus
              </div>
            ))}
            <div className="pt-2 text-xs text-muted-foreground">
              {transfers.length} transfer transaction{transfers.length === 1 ? "" : "s"} will be created
            </div>
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Closing…" : "Confirm close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
