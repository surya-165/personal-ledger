import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/zerodha/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const requestToken = url.searchParams.get("request_token") ?? "";
        const status = url.searchParams.get("status") ?? "";
        const target = new URL("/investments", url.origin);
        if (requestToken && status !== "error") {
          target.searchParams.set("kite_request_token", requestToken);
        } else {
          target.searchParams.set("kite_error", "1");
        }
        return new Response(null, { status: 302, headers: { Location: target.toString() } });
      },
    },
  },
});
