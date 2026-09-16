import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, ccOutstanding, type AccountRow, type TxRow } from "@/lib/finance-db";
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
    setBusy(true);
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
      note: note.trim() || null,
    } as never);
    setBusy(false);
    if (pErr) {
      await supabase.from("transactions").delete().eq("id", payTxId);
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
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Paid from</Label>
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
