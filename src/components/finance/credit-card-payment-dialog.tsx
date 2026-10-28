import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, ccOutstanding, BUCKETS, type AccountRow, type TxRow } from "@/lib/finance-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function CreditCardPaymentDialog({
  tx, accounts, creditCardAccountId, userId, onClose, onSaved,
}: {
  tx: TxRow | null;
  accounts: AccountRow[];
  creditCardAccountId: string | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!tx} onOpenChange={(o) => { if (!o) onClose(); }}>
      {tx ? (
        <PaymentForm
          key={tx.id}
          tx={tx}
          accounts={accounts}
          creditCardAccountId={creditCardAccountId}
          userId={userId}
          onSaved={onSaved}
        />
      ) : null}
    </Dialog>
  );
}

function PaymentForm({
  tx, accounts, creditCardAccountId, userId, onSaved,
}: {
  tx: TxRow;
  accounts: AccountRow[];
  creditCardAccountId: string | null;
  userId: string;
  onSaved: () => void;
}) {
  const paid = Number(tx.credit_card_paid_amount ?? 0);
  const outstanding = ccOutstanding(tx);
  const [amount, setAmount] = useState(String(outstanding));
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sourceKind, setSourceKind] = useState<"account" | "surplus" | "fund">("account");
  const [surplusBucket, setSurplusBucket] = useState("");
  const [fundId, setFundId] = useState("");
  const [funds, setFunds] = useState<{ id: string; name: string; account_id: string | null }[]>([]);
  const [entries, setEntries] = useState<{ bucket: string; surplus_amount: number; destination_account_id: string | null }[]>([]);
  const [paidBy, setPaidBy] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const [f, e, t] = await Promise.all([
        supabase.from("funds").select("id,name,account_id"),
        supabase.from("surplus_entries" as never).select("bucket,surplus_amount,destination_account_id"),
        supabase.from("transactions").select("surplus_bucket,amount").eq("type", "surplus_payment" as never),
      ]);
      setFunds(((f.data ?? []) as unknown) as typeof funds);
      setEntries(((e.data ?? []) as unknown) as typeof entries);
      const m: Record<string, number> = {};
      for (const r of ((t.data ?? []) as unknown as { surplus_bucket: string | null; amount: number }[])) {
        if (r.surplus_bucket) m[r.surplus_bucket] = (m[r.surplus_bucket] ?? 0) + Number(r.amount);
      }
      setPaidBy(m);
    })();
  }, []);

  function pickSurplusBucket(b: string) {
    setSurplusBucket(b);
    const dest = entries.find((x) => x.bucket === b && x.destination_account_id)?.destination_account_id;
    if (dest && accounts.some((a) => a.id === dest)) setAccountId(dest);
  }
  function pickFund(id: string) {
    setFundId(id);
    const acc = funds.find((x) => x.id === id)?.account_id;
    const sbi = accounts.find((a) => a.code === "SBI");
    setAccountId(acc && accounts.some((a) => a.id === acc) ? acc : sbi?.id ?? accountId);
  }

  const amt = Number(amount);
  const invalid =
    !Number.isFinite(amt) || amt <= 0
      ? "Enter an amount greater than zero"
      : amt > outstanding
        ? `Cannot exceed the outstanding ${formatINR(outstanding)}`
        : "";

  async function confirm() {
    if (invalid) return;
    if (!accountId) { toast.error("Pick the account you paid from"); return; }
    if (!creditCardAccountId) { toast.error("Credit card account missing"); return; }
    if (sourceKind === "surplus" && !surplusBucket) { toast.error("Choose a surplus bucket"); return; }
    if (sourceKind === "fund" && !fundId) { toast.error("Choose a goal fund"); return; }
    setBusy(true);
    let surplusTxId: string | null = null;
    if (sourceKind !== "account") {
      const { data: sTx, error: sErr } = await supabase.from("transactions").insert({
        user_id: userId,
        date,
        type: "surplus_payment",
        account_id: accountId,
        amount: amt,
        description: `Credit card payment — ${tx.description || "expense"}`,
        bucket: null,
        sub_category: null,
        surplus_bucket: sourceKind === "surplus" ? surplusBucket : null,
        source_fund_id: sourceKind === "fund" ? fundId : null,
      } as never).select("id").single();
      if (sErr || !sTx) { setBusy(false); toast.error(sErr?.message ?? "Could not record the surplus deduction"); return; }
      surplusTxId = (sTx as { id: string }).id;
    }
    const { data: payTx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        date,
        type: "transfer",
        account_id: accountId,
        destination_account_id: creditCardAccountId,
        amount: amt,
        description: `Credit card payment — ${tx.description || "expense"}`,
        bucket: null,
        sub_category: null,
      } as never)
      .select("id")
      .single();
    if (txErr || !payTx) {
      setBusy(false);
      if (surplusTxId) await supabase.from("transactions").delete().eq("id", surplusTxId);
      toast.error(txErr?.message ?? "Could not record the payment");
      return;
    }
    const payTxId = (payTx as { id: string }).id;
    const { error: pErr } = await supabase.from("credit_card_payments" as never).insert({
      user_id: userId,
      transaction_id: tx.id,
      payment_amount: amt,
      paid_from_account_id: accountId,
      payment_date: date,
      payment_transaction_id: payTxId,
      surplus_transaction_id: surplusTxId,
      note: note.trim() || null,
    } as never);
    setBusy(false);
    if (pErr) {
      await supabase.from("transactions").delete().in("id", [payTxId, ...(surplusTxId ? [surplusTxId] : [])]);
      toast.error(pErr.message);
      return;
    }
    toast.success(amt >= outstanding ? "Marked as paid in full" : "Partial payment logged");
    onSaved();
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Log payment — {tx.description || "Credit card expense"}</DialogTitle>
      </DialogHeader>

      <div className="rounded-lg border border-border bg-muted/30 p-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Transaction</div>
          <div className="tabular-nums font-medium">{formatINR(Number(tx.amount))}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Already paid</div>
          <div className="tabular-nums font-medium">{formatINR(paid)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className="tabular-nums font-medium text-warning">{formatINR(outstanding)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Payment amount (₹)</Label>
          <Input
            type="number" min="0" step="0.01" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)}
          />
          {invalid ? <p className="mt-1 text-xs text-destructive">{invalid}</p> : null}
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Pay using</Label>
          <div className="grid grid-cols-3 gap-2">
            <Button type="button" size="sm" variant={sourceKind === "account" ? "default" : "outline"} onClick={() => setSourceKind("account")}>Bank account</Button>
            <Button type="button" size="sm" variant={sourceKind === "surplus" ? "default" : "outline"} onClick={() => setSourceKind("surplus")}>Surplus</Button>
            <Button type="button" size="sm" variant={sourceKind === "fund" ? "default" : "outline"} onClick={() => setSourceKind("fund")}>Goal fund</Button>
          </div>
        </div>
        {sourceKind === "surplus" ? (
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Surplus bucket</Label>
            <Select value={surplusBucket} onValueChange={pickSurplusBucket}>
              <SelectTrigger><SelectValue placeholder="Choose a bucket" /></SelectTrigger>
              <SelectContent>
                {BUCKETS.map((b) => {
                  const left = entries.filter((e) => e.bucket === b).reduce((s2, e) => s2 + Number(e.surplus_amount), 0) - (paidBy[b] ?? 0);
                  return <SelectItem key={b} value={b}>{b}<span className="ml-2 text-muted-foreground">· {formatINR(left)} left</span></SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {sourceKind === "fund" ? (
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Goal fund</Label>
            <Select value={fundId} onValueChange={pickFund}>
              <SelectTrigger><SelectValue placeholder="Choose a fund" /></SelectTrigger>
              <SelectContent>
                {funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">{sourceKind === "account" ? "Paid from" : "Bank account debited"}</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Payment date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={confirm} disabled={busy || !!invalid}>
          {busy ? "Saving…" : "Confirm payment"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * Delete a credit card expense along with every payment record and the
 * bank-side debit transfers those payments created.
 */
export async function deleteCreditCardTransaction(txId: string, paymentTxIds: string[]) {
  const { data: links } = await supabase
    .from("credit_card_payments" as never)
    .select("surplus_transaction_id")
    .eq("transaction_id", txId);
  const surplusIds = ((links ?? []) as { surplus_transaction_id: string | null }[])
    .map((l) => l.surplus_transaction_id)
    .filter((x): x is string => !!x);
  paymentTxIds = [...paymentTxIds, ...surplusIds];
  if (paymentTxIds.length > 0) {
    const { error } = await supabase.from("transactions").delete().in("id", paymentTxIds);
    if (error) throw error;
  }
  const { error: pErr } = await supabase
    .from("credit_card_payments" as never)
    .delete()
    .eq("transaction_id", txId);
  if (pErr) throw pErr;
  const { error } = await supabase.from("transactions").delete().eq("id", txId);
  if (error) throw error;
}
