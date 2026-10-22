import { supabase } from "@/integrations/supabase/client";
import { BUCKETS, type Bucket } from "@/lib/finance-db";

/** Source account code each bucket's money comes from. */
export const bucketSourceCode: Record<Bucket, string> = {
  "Regular Expenses": "CUB",
  "SIP Investments": "HDFC",
  "Fund Contributions": "SBI",
  "Fixed Commitments": "SBI",
  "Tax Reserve": "SBI",
  "Others": "CUB",
};

/** Default destination account code for a bucket's surplus. */
export const bucketDefaultDestCode: Record<Bucket, string> = {
  "Regular Expenses": "HDFC",
  "SIP Investments": "HDFC",
  "Fund Contributions": "SBI",
  "Fixed Commitments": "SBI",
  "Tax Reserve": "SBI",
  "Others": "HDFC",
};

export const ALL_BUCKETS = BUCKETS;

export function monthKey(year: number, month1: number): string {
  return `${year}-${String(month1).padStart(2, "0")}-01`;
}

export function lastDayOfMonth(year: number, month1: number): Date {
  return new Date(year, month1, 0);
}

export function monthLabelOf(year: number, month1: number): string {
  return new Date(year, month1 - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export interface ClosureRow {
  id: string;
  month: string;
  closed_at: string;
  notes: string | null;
}

export interface SurplusEntryRow {
  id: string;
  closure_id: string;
  month: string;
  bucket: string;
  planned_amount: number;
  actual_amount: number;
  surplus_amount: number;
  source_account_id: string | null;
  destination_account_id: string | null;
  destination_note: string | null;
  transfer_transaction_id: string | null;
}

export async function fetchClosures(): Promise<ClosureRow[]> {
  const { data, error } = await supabase
    .from("month_closures")
    .select("id,month,closed_at,notes")
    .order("month", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClosureRow[];
}

export async function fetchSurplusEntries(): Promise<SurplusEntryRow[]> {
  const { data, error } = await supabase
    .from("surplus_entries")
    .select("*")
    .order("bucket");
  if (error) throw error;
  return (data ?? []) as unknown as SurplusEntryRow[];
}

export interface CloseBucketInput {
  bucket: Bucket;
  planned: number;
  actual: number;
  surplus: number;
  /** Amount actually transferred; defaults to surplus but user-editable. */
  transferAmount?: number;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  note: string;
}

/**
 * Executes a month close. Best-effort atomic: anything created is removed
 * again if a later step fails.
 */
export async function closeMonth(opts: {
  userId: string;
  month: string; // yyyy-mm-01
  monthLabel: string;
  lastDay: string; // yyyy-mm-dd
  buckets: CloseBucketInput[];
}) {
  const { userId, month, monthLabel, lastDay, buckets } = opts;

  const { data: closure, error: cErr } = await supabase
    .from("month_closures")
    .insert({ user_id: userId, month })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const closureId = closure!.id as string;

  const createdTxIds: string[] = [];
  try {
    const entries: Record<string, unknown>[] = [];
    for (const b of buckets) {
      let txId: string | null = null;
      const amt = b.transferAmount ?? b.surplus;
      const needsTransfer =
        b.surplus > 0 &&
        amt > 0 &&
        b.sourceAccountId &&
        b.destinationAccountId &&
        b.sourceAccountId !== b.destinationAccountId;
      if (needsTransfer) {
        const { data: tx, error: tErr } = await supabase
          .from("transactions")
          .insert({
            user_id: userId,
            date: lastDay,
            type: "transfer",
            account_id: b.sourceAccountId!,
            destination_account_id: b.destinationAccountId!,
            amount: amt,
            description: `${b.bucket} surplus transfer — ${monthLabel} close`,
            bucket: null,
          })
          .select("id")
          .single();
        if (tErr) throw tErr;
        txId = tx!.id as string;
        createdTxIds.push(txId);
      }
      entries.push({
        user_id: userId,
        closure_id: closureId,
        month,
        bucket: b.bucket,
        planned_amount: b.planned,
        actual_amount: b.actual,
        surplus_amount: b.surplus,
        source_account_id: b.sourceAccountId,
        destination_account_id: b.surplus > 0 ? b.destinationAccountId : null,
        destination_note: b.note || null,
        transfer_transaction_id: txId,
      });
    }

    const { error: eErr } = await supabase.from("surplus_entries").insert(entries as never);
    if (eErr) throw eErr;
    return { closureId, transfersCreated: createdTxIds.length };
  } catch (e) {
    if (createdTxIds.length) {
      await supabase.from("transactions").delete().in("id", createdTxIds);
    }
    await supabase.from("month_closures").delete().eq("id", closureId);
    throw e;
  }
}
