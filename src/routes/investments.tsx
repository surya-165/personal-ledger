import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, Link2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatINR } from "@/lib/finance-db";
import { getKiteLoginUrl, exchangeKiteToken, getKiteHoldings } from "@/lib/kite.functions";
import { PageHeader } from "@/components/finance/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/investments")({
  head: () => ({
    meta: [
      { title: "Investments — Goal Tracker" },
      { name: "description", content: "Goal-based investment dashboard powered by live Zerodha holdings, SIPs and equity." },
      { property: "og:title", content: "Investments — Goal Tracker" },
      { property: "og:description", content: "Goal-based investment dashboard powered by live Zerodha holdings, SIPs and equity." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvestmentsPage,
});

type Goal = {
  id: string;
  name: string;
  time_frame_months: number;
  target_amount: number;
  expected_return_percent: number;
};
type GoalDraft = Goal & { isNew?: boolean };
type Mapping = {
  id: string;
  goal_id: string;
  mapping_type: "mf_holding" | "equity";
  kite_tradingsymbol: string | null;
  equity_allocation_percent: number | null;
};

const num = (v: string) => (v === "" ? 0 : Number(v) || 0);

function monthsLabel(months: number) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (months <= 0) return "Target date reached";
  return `${y > 0 ? `${y} year${y > 1 ? "s" : ""} ` : ""}${m > 0 ? `${m} month${m > 1 ? "s" : ""} ` : ""}remaining`;
}

function futureValue(pv: number, pmt: number, annualPercent: number, months: number) {
  const r = annualPercent / 12 / 100;
  if (months <= 0) return pv;
  if (r === 0) return pv + pmt * months;
  const f = Math.pow(1 + r, months);
  return pv * f + pmt * ((f - 1) / r);
}
function requiredPmt(pv: number, target: number, annualPercent: number, months: number) {
  const r = annualPercent / 12 / 100;
  if (months <= 0) return 0;
  if (r === 0) return Math.max(0, (target - pv) / months);
  const f = Math.pow(1 + r, months);
  return Math.max(0, ((target - pv * f) * r) / (f - 1));
}

function InvestmentsPage() {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const holdingsFn = useServerFn(getKiteHoldings);
  const loginUrlFn = useServerFn(getKiteLoginUrl);
  const exchangeFn = useServerFn(exchangeKiteToken);
  const [tab, setTab] = useState("dashboard");

  const goalsQ = useQuery({
    enabled: !!user,
    queryKey: ["goals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goals")
        .select("id,name,time_frame_months,target_amount,expected_return_percent")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Goal[];
    },
  });

  const mappingsQ = useQuery({
    enabled: !!user,
    queryKey: ["goal_mappings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goal_mappings")
        .select("id,goal_id,mapping_type,kite_tradingsymbol,equity_allocation_percent");
      if (error) throw error;
      return (data ?? []) as Mapping[];
    },
  });

  const kiteQ = useQuery({
    enabled: !!user,
    queryKey: ["kite-holdings"],
    queryFn: () => holdingsFn(),
    staleTime: 60_000,
    retry: false,
  });

  // Handle the Zerodha redirect (?kite_request_token=...)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("kite_request_token");
    if (params.get("kite_error")) {
      toast.error("Zerodha login was cancelled");
      window.history.replaceState({}, "", "/investments");
      return;
    }
    if (!token) return;
    window.history.replaceState({}, "", "/investments");
    exchangeFn({ data: { request_token: token } })
      .then(() => {
        toast.success("Zerodha connected");
        qc.invalidateQueries({ queryKey: ["kite-holdings"] });
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Zerodha connection failed"));
  }, [user, exchangeFn, qc]);

  const connect = async () => {
    try {
      const { loginUrl } = await loginUrlFn();
      window.location.href = loginUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Zerodha login");
    }
  };

  if (authLoading) return null;
  if (!user) {
    return (
      <div>
        <PageHeader title="Investments" description="Goal-based tracking of your Zerodha portfolio." />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sign in to view your investments.</CardContent></Card>
      </div>
    );
  }

  const kite = kiteQ.data;
  const portfolio = kite?.portfolio ?? null;

  return (
    <div>
      <PageHeader title="Investments" description="Goal-based tracking of your live Zerodha mutual funds and equity." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="setup">Setup</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <DashboardTab
            loading={kiteQ.isLoading || goalsQ.isLoading || mappingsQ.isLoading}
            connected={!!kite?.connected}
            expired={!!kite?.expired}
            portfolio={portfolio}
            goals={goalsQ.data ?? []}
            mappings={mappingsQ.data ?? []}
            onConnect={connect}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["kite-holdings"] })}
            refreshing={kiteQ.isFetching}
            onGoSetup={() => setTab("setup")}
          />
        </TabsContent>

        <TabsContent value="setup">
          <SetupTab
            userId={user.id}
            goals={goalsQ.data ?? []}
            mappings={mappingsQ.data ?? []}
            portfolio={portfolio}
            connected={!!kite?.connected && !kite?.expired}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────── Setup tab ───────────────────────── */

type Portfolio = NonNullable<Awaited<ReturnType<typeof getKiteHoldings>>["portfolio"]>;

function SetupTab({
  userId,
  goals,
  mappings,
  portfolio,
  connected,
}: {
  userId: string;
  goals: Goal[];
  mappings: Mapping[];
  portfolio: Portfolio | null;
  connected: boolean;
}) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<GoalDraft[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  useEffect(() => setDrafts(goals.map((g) => ({ ...g }))), [goals]);

  const [mfMap, setMfMap] = useState<Record<string, string>>({});
  const [equityMap, setEquityMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const mf: Record<string, string> = {};
    const eq: Record<string, string> = {};
    for (const m of mappings) {
      if (m.mapping_type === "mf_holding" && m.kite_tradingsymbol) mf[m.kite_tradingsymbol] = m.goal_id;
      if (m.mapping_type === "equity") eq[m.goal_id] = String(m.equity_allocation_percent ?? 0);
    }
    setMfMap(mf);
    setEquityMap(eq);
  }, [mappings]);

  const saveGoals = useMutation({
    mutationFn: async () => {
      if (removed.length) {
        const { error } = await supabase.from("goals").delete().in("id", removed);
        if (error) throw error;
      }
      const rows = drafts.map((d) => ({
        ...(d.isNew ? {} : { id: d.id }),
        user_id: userId,
        name: d.name.trim() || "Untitled goal",
        time_frame_months: Math.max(0, Math.round(d.time_frame_months)),
        target_amount: d.target_amount,
        expected_return_percent: d.expected_return_percent,
      }));
      if (rows.length) {
        const { error } = await supabase.from("goals").upsert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setRemoved([]);
      toast.success("Goals saved");
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["goal_mappings"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save goals"),
  });

  const equityTotal = Object.values(equityMap).reduce((s, v) => s + num(v), 0);

  const saveMappings = useMutation({
    mutationFn: async () => {
      if (equityTotal > 100) throw new Error("Equity allocations exceed 100%");
      const { error: delErr } = await supabase.from("goal_mappings").delete().eq("user_id", userId);
      if (delErr) throw delErr;
      const rows: Array<Record<string, unknown>> = [];
      for (const [symbol, goalId] of Object.entries(mfMap)) {
        if (!goalId) continue;
        rows.push({ user_id: userId, goal_id: goalId, mapping_type: "mf_holding", kite_tradingsymbol: symbol });
      }
      for (const [goalId, pct] of Object.entries(equityMap)) {
        const p = num(pct);
        if (p <= 0) continue;
        rows.push({ user_id: userId, goal_id: goalId, mapping_type: "equity", equity_allocation_percent: p });
      }
      if (rows.length) {
        const { error } = await supabase.from("goal_mappings").insert(rows as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Mappings saved");
      qc.invalidateQueries({ queryKey: ["goal_mappings"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save mappings"),
  });

  const update = (i: number, patch: Partial<GoalDraft>) =>
    setDrafts((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold">Define goals</h2>
        <p className="text-sm text-muted-foreground mb-4">Name each goal, when you need the money, how much, and the return you expect.</p>
        <Card>
          <CardContent className="p-4 space-y-4">
            {drafts.length === 0 && <p className="text-sm text-muted-foreground">No goals yet.</p>}
            {drafts.map((g, i) => {
              const years = Math.floor(g.time_frame_months / 12);
              const months = g.time_frame_months % 12;
              return (
                <div key={g.id} className="grid grid-cols-1 md:grid-cols-[1.4fr_auto_auto_1fr_auto_auto] gap-3 items-end border-b border-border pb-4 last:border-0 last:pb-0">
                  <div>
                    <Label className="text-xs">Goal name</Label>
                    <Input value={g.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Retirement" />
                  </div>
                  <div>
                    <Label className="text-xs">Years</Label>
                    <Input className="w-20" inputMode="numeric" value={years} onChange={(e) => update(i, { time_frame_months: num(e.target.value) * 12 + months })} />
                  </div>
                  <div>
                    <Label className="text-xs">Months</Label>
                    <Input className="w-20" inputMode="numeric" value={months} onChange={(e) => update(i, { time_frame_months: years * 12 + num(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">Target amount (₹)</Label>
                    <Input inputMode="numeric" value={g.target_amount} onChange={(e) => update(i, { target_amount: num(e.target.value) })} />
                  </div>
                  <div>
                    <Label className="text-xs">Return % p.a.</Label>
                    <Input className="w-24" inputMode="decimal" value={g.expected_return_percent} onChange={(e) => update(i, { expected_return_percent: num(e.target.value) })} />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete goal"
                    onClick={() => {
                      if (!g.isNew) setRemoved((r) => [...r, g.id]);
                      setDrafts((d) => d.filter((_, idx) => idx !== i));
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDrafts((d) => [
                    ...d,
                    { id: crypto.randomUUID(), name: "", time_frame_months: 120, target_amount: 0, expected_return_percent: 12, isNew: true },
                  ])
                }
              >
                <Plus className="h-4 w-4 mr-1" /> Add goal
              </Button>
              <Button size="sm" onClick={() => saveGoals.mutate()} disabled={saveGoals.isPending}>
                {saveGoals.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save goals
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="text-base font-semibold">Map funds to goals</h2>
        <p className="text-sm text-muted-foreground mb-4">Assign live Zerodha holdings to the goals above.</p>
        {!connected || !portfolio ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Connect Zerodha from the Dashboard tab to map your holdings.</CardContent></Card>
        ) : goals.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Define and save at least one goal first.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Mutual fund holdings</div>
                {portfolio.mf_holdings.length === 0 && <p className="text-sm text-muted-foreground">No mutual fund holdings found.</p>}
                {portfolio.mf_holdings.map((h) => (
                  <div key={h.tradingsymbol} className="flex flex-col md:flex-row md:items-center gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{h.fund}</div>
                      <div className="mt-1 flex items-center gap-2">
                        {h.sip_status === "active_sip" ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 font-normal">Active SIP — {formatINR(h.instalment_amount)}/month</Badge>
                        ) : (
                          <Badge variant="secondary" className="font-normal text-muted-foreground">Holding only — SIP stopped</Badge>
                        )}
                        <span className="text-sm tabular-nums text-muted-foreground">{formatINR(h.value)}</span>
                      </div>
                    </div>
                    <Select
                      value={mfMap[h.tradingsymbol] ?? "unmapped"}
                      onValueChange={(v) => setMfMap((m) => ({ ...m, [h.tradingsymbol]: v === "unmapped" ? "" : v }))}
                    >
                      <SelectTrigger className="w-full md:w-56"><SelectValue placeholder="Unmapped" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unmapped">Unmapped</SelectItem>
                        {goals.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Equity portfolio</div>
                    <div className="text-lg font-semibold tabular-nums">{formatINR(portfolio.equity.total_equity_value)}</div>
                  </div>
                  <div className={`text-sm tabular-nums ${equityTotal > 100 ? "text-destructive" : "text-muted-foreground"}`}>
                    Allocated: {equityTotal}% · Remaining: {Math.max(0, 100 - equityTotal)}%
                  </div>
                </div>
                {goals.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm">Allocate % of equity to {g.name}</span>
                    <Input
                      className="w-24"
                      inputMode="decimal"
                      value={equityMap[g.id] ?? ""}
                      placeholder="0"
                      onChange={(e) => setEquityMap((m) => ({ ...m, [g.id]: e.target.value }))}
                    />
                  </div>
                ))}
                {equityTotal > 100 && <p className="text-sm text-destructive">Equity allocations exceed 100% — reduce them before saving.</p>}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => saveMappings.mutate()} disabled={saveMappings.isPending}>
                {saveMappings.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save mappings
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────── Dashboard tab ───────────────────────── */

function DashboardTab({
  loading,
  connected,
  expired,
  portfolio,
  goals,
  mappings,
  onConnect,
  onRefresh,
  refreshing,
  onGoSetup,
}: {
  loading: boolean;
  connected: boolean;
  expired: boolean;
  portfolio: Portfolio | null;
  goals: Goal[];
  mappings: Mapping[];
  onConnect: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onGoSetup: () => void;
}) {
  const now = new Date();

  const computed = useMemo(() => {
    if (!portfolio) return null;
    const bySymbol = new Map(portfolio.mf_holdings.map((h) => [h.tradingsymbol, h]));
    const mappedSymbols = new Set<string>();
    let equityAllocated = 0;

    const cards = goals.map((g) => {
      const mfs = mappings
        .filter((m) => m.goal_id === g.id && m.mapping_type === "mf_holding" && m.kite_tradingsymbol)
        .map((m) => bySymbol.get(m.kite_tradingsymbol as string))
        .filter((h): h is Portfolio["mf_holdings"][number] => !!h);
      mfs.forEach((h) => mappedSymbols.add(h.tradingsymbol));

      const eqPct = Number(
        mappings.find((m) => m.goal_id === g.id && m.mapping_type === "equity")?.equity_allocation_percent ?? 0,
      );
      equityAllocated += eqPct;

      const equityValue = portfolio.equity.total_equity_value * (eqPct / 100);
      const equityInvested = portfolio.equity.total_equity_invested * (eqPct / 100);
      const corpus = mfs.reduce((s, h) => s + h.value, 0) + equityValue;
      const invested = mfs.reduce((s, h) => s + h.total_invested, 0) + equityInvested;
      const gain = corpus - invested;
      const gainPct = invested > 0 ? (gain / invested) * 100 : 0;
      const monthlySip = mfs.filter((h) => h.sip_status === "active_sip").reduce((s, h) => s + h.instalment_amount, 0);
      const fv = futureValue(corpus, monthlySip, g.expected_return_percent, g.time_frame_months);
      const gap = g.target_amount - fv;
      const needPmt = requiredPmt(corpus, g.target_amount, g.expected_return_percent, g.time_frame_months);
      return { goal: g, mfs, eqPct, equityValue, corpus, invested, gain, gainPct, monthlySip, fv, gap, needPmt };
    });

    const unmappedMf = portfolio.mf_holdings.filter((h) => !mappedSymbols.has(h.tradingsymbol));
    const unallocatedEquityPct = Math.max(0, 100 - equityAllocated);
    return { cards, unmappedMf, unallocatedEquityPct };
  }, [portfolio, goals, mappings]);

  if (loading) {
    return <Card><CardContent className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  if (!connected) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Connect Zerodha to see your investment dashboard.</p>
          <Button onClick={onConnect}><Link2 className="h-4 w-4 mr-1" /> Connect Zerodha</Button>
        </CardContent>
      </Card>
    );
  }

  const banner = expired ? (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-2.5 mb-6">
      <span className="text-sm text-muted-foreground">Session expired · reconnect to refresh your holdings</span>
      <Button size="sm" variant="outline" onClick={onConnect}>Reconnect</Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-2.5 mb-6">
      <span className="text-sm text-muted-foreground">
        Zerodha connected · Last synced:{" "}
        {portfolio ? new Date(portfolio.fetched_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
      </span>
      <Button size="sm" variant="ghost" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
      </Button>
    </div>
  );

  if (expired || !portfolio || !computed) return <div>{banner}</div>;

  if (goals.length === 0 || mappings.length === 0) {
    return (
      <div>
        {banner}
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-sm text-muted-foreground">Set up your goals in the Setup tab to see the dashboard.</p>
            <Button variant="outline" onClick={onGoSetup}>Go to Setup</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {banner}
      <div className="space-y-5">
        {computed.cards.map((c) => {
          const pct = c.goal.target_amount > 0 ? Math.min(100, (c.corpus / c.goal.target_amount) * 100) : 0;
          return (
            <Card key={c.goal.id}>
              <CardContent className="p-5 space-y-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="text-xl font-semibold">{c.goal.name}</div>
                    <div className="text-sm text-muted-foreground">{monthsLabel(c.goal.time_frame_months)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Target</div>
                    <div className="text-lg font-semibold tabular-nums">{formatINR(c.goal.target_amount)}</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Current corpus</span>
                    <span className="text-lg font-semibold tabular-nums">{formatINR(c.corpus)}</span>
                  </div>
                  <Progress value={pct} className="mt-2 h-2" />
                  <div className="mt-3 space-y-1.5">
                    {c.mfs.map((h) => (
                      <div key={h.tradingsymbol} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">
                          {h.fund}{" "}
                          <span className="text-xs text-muted-foreground">
                            · {h.sip_status === "active_sip" ? "Active SIP" : "Holding only"}
                          </span>
                        </span>
                        <span className="tabular-nums">{formatINR(h.value)}</span>
                      </div>
                    ))}
                    {c.eqPct > 0 && (
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span>Equity portfolio · {c.eqPct}% allocation</span>
                        <span className="tabular-nums">{formatINR(c.equityValue)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-border pt-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Invested</div>
                    <div className="mt-1 tabular-nums font-medium">{formatINR(c.invested)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Return so far</div>
                    <div className={`mt-1 tabular-nums font-medium ${c.gain >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {c.gainPct >= 0 ? "+" : ""}{c.gainPct.toFixed(1)}% · {formatINR(c.gain)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Monthly SIP</div>
                    <div className="mt-1 tabular-nums font-medium">{formatINR(c.monthlySip)}</div>
                  </div>
                </div>

                <div className="border-t border-border pt-4 space-y-1.5">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">This month's SIPs</div>
                  {c.mfs.length === 0 && <div className="text-sm text-muted-foreground">Nothing mapped yet.</div>}
                  {c.mfs.map((h) => {
                    if (h.sip_status !== "active_sip") {
                      return (
                        <div key={h.tradingsymbol} className="flex justify-between text-sm text-muted-foreground">
                          <span className="truncate">{h.fund}</span>
                          <span>₹0 — SIP ended, holding retained</span>
                        </div>
                      );
                    }
                    const next = h.next_instalment_date ? new Date(h.next_instalment_date) : null;
                    const done =
                      !!next &&
                      (next.getFullYear() > now.getFullYear() ||
                        (next.getFullYear() === now.getFullYear() && next.getMonth() > now.getMonth()));
                    return (
                      <div key={h.tradingsymbol} className="flex justify-between text-sm">
                        <span className="truncate">{h.fund}</span>
                        <span className={done ? "text-emerald-600" : "text-amber-600"}>
                          {done ? "Processed this month" : "Pending this month"}
                          {next ? ` · next ${next.toLocaleDateString()}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Projected at target date</span>
                    <span className="text-lg font-semibold tabular-nums">{formatINR(c.fv)}</span>
                  </div>
                  {c.gap > 0 ? (
                    <p className="mt-1 text-sm text-amber-600">
                      {formatINR(c.gap)} short of target — consider increasing SIP by {formatINR(Math.max(0, c.needPmt - c.monthlySip))}/month
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-emerald-600">On track · {formatINR(Math.abs(c.gap))} ahead of target</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">Assumed return: {c.goal.expected_return_percent}% per annum</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(computed.unmappedMf.length > 0 || computed.unallocatedEquityPct > 0) && (
        <section className="mt-8">
          <h2 className="text-base font-semibold mb-3">Unmapped assets</h2>
          <Card>
            <CardContent className="p-4 space-y-2">
              {computed.unmappedMf.map((h) => (
                <div key={h.tradingsymbol} className="flex justify-between gap-3 text-sm">
                  <span className="truncate">{h.fund}</span>
                  <span className="tabular-nums">{formatINR(h.value)}</span>
                </div>
              ))}
              {computed.unallocatedEquityPct > 0 && (
                <div className="flex justify-between gap-3 text-sm">
                  <span>Equity portfolio · {computed.unallocatedEquityPct}% unallocated</span>
                  <span className="tabular-nums">
                    {formatINR(portfolio.equity.total_equity_value * (computed.unallocatedEquityPct / 100))}
                  </span>
                </div>
              )}
              <p className="pt-1 text-xs text-muted-foreground">Assign these in the Setup tab to include them in a goal.</p>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
