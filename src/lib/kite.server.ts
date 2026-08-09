const KITE_BASE = "https://api.kite.trade";

export function getKiteApiKey(): string {
  const key = process.env["KITE_API_KEY"];
  if (!key) throw new Error("KITE_API_KEY is not configured");
  return key;
}

export function getKiteSecret(): string {
  // Secret is stored under KITE_SECRET_KEY; older projects used KITE_API_SECRET.
  const secret = process.env["KITE_SECRET_KEY"] ?? process.env["KITE_API_SECRET"];
  if (!secret) throw new Error("KITE_SECRET_KEY is not configured");
  return secret;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function kiteSessionToken(requestToken: string) {
  const apiKey = getKiteApiKey();
  const checksum = await sha256Hex(apiKey + getKiteSecret() + requestToken);
  const res = await fetch(`${KITE_BASE}/session/token`, {
    method: "POST",
    headers: { "X-Kite-Version": "3", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
  });
  const json = (await res.json()) as { status?: string; data?: Record<string, string>; message?: string };
  if (!res.ok || json.status !== "success" || !json.data) {
    throw new Error(json.message ?? "Kite session exchange failed");
  }
  return json.data;
}

async function kiteGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${KITE_BASE}${path}`, {
    headers: {
      "X-Kite-Version": "3",
      Authorization: `token ${getKiteApiKey()}:${accessToken}`,
    },
  });
  const json = (await res.json()) as { status?: string; data?: T; message?: string };
  if (res.status === 403) throw new Error("KITE_SESSION_EXPIRED");
  if (!res.ok || json.status !== "success") throw new Error(json.message ?? `Kite request failed: ${path}`);
  return json.data as T;
}

export type KiteMfHolding = {
  tradingsymbol: string;
  fund: string;
  quantity: number;
  average_price: number;
  last_price: number;
};
export type KiteSip = {
  tradingsymbol: string;
  status: string;
  instalment_amount: number;
  next_instalment: string | null;
  completed_instalments: number;
};
export type KiteEquityHolding = { quantity: number; average_price: number; last_price: number };

export type MfHoldingView = {
  tradingsymbol: string;
  fund: string;
  units: number;
  average_price: number;
  last_price: number;
  value: number;
  total_invested: number;
  actual_return_percent: number;
  sip_status: "active_sip" | "stopped_sip";
  sip_state: string | null;
  instalment_amount: number;
  next_instalment_date: string | null;
  completed_instalments: number;
};

export type KitePortfolio = {
  mf_holdings: MfHoldingView[];
  equity: {
    total_equity_value: number;
    total_equity_invested: number;
    actual_return_percent: number;
  };
  fetched_at: string;
};

export async function fetchKitePortfolio(accessToken: string): Promise<KitePortfolio> {
  const [mf, sips, equity] = await Promise.all([
    kiteGet<KiteMfHolding[]>("/mf/holdings", accessToken),
    kiteGet<KiteSip[]>("/mf/sips", accessToken).catch(() => [] as KiteSip[]),
    kiteGet<KiteEquityHolding[]>("/portfolio/holdings", accessToken).catch(() => [] as KiteEquityHolding[]),
  ]);

  const sipBySymbol = new Map<string, KiteSip>();
  for (const s of sips ?? []) {
    const state = (s.status ?? "").toLowerCase();
    const existing = sipBySymbol.get(s.tradingsymbol);
    const better = state === "active" || state === "paused";
    if (!existing || better) sipBySymbol.set(s.tradingsymbol, s);
  }

  const mf_holdings: MfHoldingView[] = (mf ?? []).map((h) => {
    const units = Number(h.quantity) || 0;
    const value = units * (Number(h.last_price) || 0);
    const total_invested = units * (Number(h.average_price) || 0);
    const sip = sipBySymbol.get(h.tradingsymbol);
    const state = (sip?.status ?? "").toLowerCase();
    const isActive = state === "active" || state === "paused";
    return {
      tradingsymbol: h.tradingsymbol,
      fund: h.fund,
      units,
      average_price: Number(h.average_price) || 0,
      last_price: Number(h.last_price) || 0,
      value,
      total_invested,
      actual_return_percent: total_invested > 0 ? ((value - total_invested) / total_invested) * 100 : 0,
      sip_status: isActive ? "active_sip" : "stopped_sip",
      sip_state: sip?.status ?? null,
      instalment_amount: isActive ? Number(sip?.instalment_amount) || 0 : 0,
      next_instalment_date: sip?.next_instalment ?? null,
      completed_instalments: Number(sip?.completed_instalments) || 0,
    };
  });

  let total_equity_value = 0;
  let total_equity_invested = 0;
  for (const e of equity ?? []) {
    const q = Number(e.quantity) || 0;
    total_equity_value += q * (Number(e.last_price) || 0);
    total_equity_invested += q * (Number(e.average_price) || 0);
  }

  return {
    mf_holdings,
    equity: {
      total_equity_value,
      total_equity_invested,
      actual_return_percent:
        total_equity_invested > 0
          ? ((total_equity_value - total_equity_invested) / total_equity_invested) * 100
          : 0,
    },
    fetched_at: new Date().toISOString(),
  };
}
