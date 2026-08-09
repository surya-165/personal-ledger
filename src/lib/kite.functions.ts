import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getKiteLoginUrl = createServerFn({ method: "GET" }).handler(async () => {
  const { getKiteApiKey } = await import("./kite.server");
  return { loginUrl: `https://kite.trade/connect/login?api_key=${getKiteApiKey()}&v=3` };
});

export const exchangeKiteToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { request_token: string }) => {
    if (!data?.request_token) throw new Error("request_token is required");
    return { request_token: data.request_token };
  })
  .handler(async ({ data, context }) => {
    const { kiteSessionToken } = await import("./kite.server");
    const session = await kiteSessionToken(data.request_token);
    const { error } = await context.supabase.from("kite_tokens").upsert(
      {
        user_id: context.userId,
        access_token: session["access_token"] as string,
        public_token: (session["public_token"] as string) ?? null,
        kite_user_id: (session["user_id"] as string) ?? null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return { success: true };
  });

export const getKiteHoldings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchKitePortfolio } = await import("./kite.server");
    const { data: tokenRow } = await context.supabase
      .from("kite_tokens")
      .select("access_token,updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return { connected: false as const, expired: false as const, portfolio: null };
    }
    try {
      const portfolio = await fetchKitePortfolio(tokenRow.access_token);
      return { connected: true as const, expired: false as const, portfolio };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("KITE_SESSION_EXPIRED") || msg.toLowerCase().includes("token")) {
        return { connected: true as const, expired: true as const, portfolio: null };
      }
      throw e;
    }
  });
