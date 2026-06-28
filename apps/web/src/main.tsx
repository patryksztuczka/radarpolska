import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";

import { trpc } from "./lib/trpc";
import "./styles.css";

function AdminSmokePage() {
  const health = trpc.health.useQuery();

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Private admin</p>
          <h1>Radarpolska operations</h1>
        </div>
        <span className={health.data?.status === "ok" ? "status statusOk" : "status"}>
          {health.data?.status ?? "checking"}
        </span>
      </section>

      <section className="panel">
        <h2>Backend health</h2>
        <dl>
          <div>
            <dt>Service</dt>
            <dd>{health.data?.service ?? "Waiting for Worker"}</dd>
          </div>
          <div>
            <dt>Checked at</dt>
            <dd>{health.data?.checkedAt ?? "-"}</dd>
          </div>
        </dl>
        {health.error ? <p className="error">{health.error.message}</p> : null}
      </section>
    </main>
  );
}

function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          transformer: superjson,
          url: "/trpc",
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AdminSmokePage />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
