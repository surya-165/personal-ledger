import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { exchangeKiteToken } from "@/lib/kite.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/zerodha-callback")({
  ssr: false,
  component: ZerodhaCallback,
});

function ZerodhaCallback() {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"loading" | "success" | "error" | "nosession">("loading");
  const [message, setMessage] = useState("Connecting to Zerodha...");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const requestToken = params.get("request_token") ?? "";
    const status = params.get("status") ?? "";

    if (status !== "success" || !requestToken) {
      setState("error");
      setMessage("Zerodha login failed. Please try again.");
      return;
    }

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setState("nosession");
          setMessage(
            "Your session expired during Kite login. Please log into Kanakku first, then try connecting Zerodha again.",
          );
          return;
        }
        await exchangeKiteToken({ data: { request_token: requestToken } });
        setState("success");
        setMessage("Zerodha connected successfully");
        setTimeout(() => router.navigate({ to: "/investments", replace: true }), 2000);
      } catch (e: unknown) {
        setState("error");
        setMessage(e instanceof Error ? e.message : "Could not connect to Zerodha.");
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        {state === "loading" && (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        )}
        {state === "success" && <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />}
        {(state === "error" || state === "nosession") && (
          <XCircle className="mx-auto h-8 w-8 text-destructive" />
        )}
        <p className="mt-4 text-sm font-medium text-foreground">{message}</p>
        {state === "error" && (
          <button
            onClick={() => router.navigate({ to: "/investments", replace: true })}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
        )}
        {state === "nosession" && (
          <button
            onClick={() => router.navigate({ to: "/auth" })}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to login
          </button>
        )}
      </div>
    </div>
  );
}