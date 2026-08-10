import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Kanakku" },
      { name: "description", content: "My Money Flow tracks personal finances, including bank accounts, budgets, savings goals, and investments." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Kanakku" },
      { property: "og:description", content: "My Money Flow tracks personal finances, including bank accounts, budgets, savings goals, and investments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Kanakku" },
      { name: "twitter:description", content: "My Money Flow tracks personal finances, including bank accounts, budgets, savings goals, and investments." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cbcc6599-2f69-428e-a8ab-97056848049a/id-preview-2e5444f6--e086f00f-a1ed-4c21-a4f3-fbad91948a27.lovable.app-1783060013623.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cbcc6599-2f69-428e-a8ab-97056848049a/id-preview-2e5444f6--e086f00f-a1ed-4c21-a4f3-fbad91948a27.lovable.app-1783060013623.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const didRedirect = useRef(false);

  // Always land on the Dashboard on a fresh page load / refresh.
  useEffect(() => {
    if (didRedirect.current) return;
    didRedirect.current = true;
    const path = window.location.pathname;
    const search = window.location.search;
    const isKiteCallback =
      path === "/zerodha-callback" ||
      search.includes("kite_request_token") ||
      search.includes("kite_error");
    if (path !== "/" && path !== "/auth" && !path.startsWith("/api") && !isKiteCallback) {
      router.navigate({ to: "/", replace: true });
    }
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-14 flex items-center gap-3 border-b border-border bg-background/80 backdrop-blur px-4 sticky top-0 z-10">
              <SidebarTrigger />
              <div className="text-sm text-muted-foreground">June 2026</div>
            </header>
            <main className="flex-1 p-6 lg:p-8 w-full max-w-[1400px] mx-auto">
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster richColors position="top-right" />
      </SidebarProvider>
    </QueryClientProvider>
  );
}
