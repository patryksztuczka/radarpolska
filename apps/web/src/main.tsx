import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { StrictMode, useEffectEvent, useState } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";

import { trpc } from "./lib/trpc";
import "./styles.css";

function AdminSmokePage() {
  const health = trpc.health.useQuery();
  const utils = trpc.useUtils();
  const operations = trpc.operations.getOverview.useQuery();
  const discoverLatestSource = trpc.operations.discoverLatestKppSource.useMutation({
    onSuccess: async () => {
      await utils.operations.getOverview.invalidate();
    },
  });
  const latestRun = operations.data?.runs[0];
  const latestSource = latestRun?.source;
  const handleDiscoverLatestSource = useEffectEvent(() => {
    discoverLatestSource.mutate();
  });

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Private admin</p>
          <h1>Radarpolska operations</h1>
          <p className="lede">
            Imports and enrichments can be monitored here before any worker pipelines are live.
          </p>
        </div>
        <span className={health.data?.status === "ok" ? "status statusOk" : "status"}>
          {health.data?.status ?? "checking"}
        </span>
      </section>

      <section className="panel panelCompact">
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

      <section className="operationsGrid">
        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Run summary</p>
              <h2>Current activity</h2>
            </div>
            <button
              className="actionButton"
              disabled={discoverLatestSource.isPending}
              onClick={handleDiscoverLatestSource}
              type="button"
            >
              {discoverLatestSource.isPending ? "Discovering..." : "Discover latest KPP source"}
            </button>
          </div>

          <dl className="statsGrid">
            <div className="statCard">
              <dt>Total runs</dt>
              <dd>{operations.data?.summary.totalRuns ?? "-"}</dd>
            </div>
            <div className="statCard">
              <dt>Active now</dt>
              <dd>{operations.data?.summary.activeRuns ?? "-"}</dd>
            </div>
            <div className="statCard">
              <dt>Succeeded</dt>
              <dd>{operations.data?.summary.successfulRuns ?? "-"}</dd>
            </div>
            <div className="statCard">
              <dt>Failed</dt>
              <dd>{operations.data?.summary.failedRuns ?? "-"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Latest source</p>
              <h2>Discovered KPP dataset</h2>
            </div>
            <span className="mutedLabel">
              {latestRun ? latestRun.status : "No discovery run yet"}
            </span>
          </div>

          {operations.error ? <p className="error">{operations.error.message}</p> : null}
          {discoverLatestSource.error ? (
            <p className="error">{discoverLatestSource.error.message}</p>
          ) : null}

          {latestSource ? (
            <dl className="sourceGrid">
              <div>
                <dt>Dataset</dt>
                <dd>{latestSource.datasetTitle}</dd>
              </div>
              <div>
                <dt>Resource ID</dt>
                <dd>{latestSource.resourceId}</dd>
              </div>
              <div>
                <dt>Data date</dt>
                <dd>{latestSource.resourceDataDate}</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>{latestSource.resourceFormat}</dd>
              </div>
              <div className="sourceSpan">
                <dt>Resource title</dt>
                <dd>{latestSource.resourceTitle}</dd>
              </div>
              <div className="sourceSpan">
                <dt>Download URL</dt>
                <dd>
                  <a href={latestSource.resourceDownloadUrl} rel="noreferrer" target="_blank">
                    {latestSource.resourceDownloadUrl}
                  </a>
                </dd>
              </div>
            </dl>
          ) : (
            <div className="emptyState">
              <p className="emptyTitle">No source discovered</p>
              <p className="emptyCopy">
                Trigger discovery to track the latest KPP dataset resource before staging or
                importing any CSV rows.
              </p>
            </div>
          )}

          {operations.data?.runs.length ? (
            <ul className="runList">
              {operations.data.runs.map((run) => (
                <li className="runRow" key={run.id}>
                  <div>
                    <p className="runTitle">{run.sourceLabel}</p>
                    <p className="runMeta">
                      {run.kind} · {run.operationKey} · {run.status}
                    </p>
                  </div>
                  <span className="runCount">{run.counters.processed}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mutedCopy">No runs recorded yet.</p>
          )}
        </article>
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
