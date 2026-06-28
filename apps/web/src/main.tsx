import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { CloudUpload, Database } from "lucide-react";
import { StrictMode, useEffectEvent, useState } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";

import { trpc } from "./lib/trpc";
import "./styles.css";

function CountList({
  counts,
  title,
}: {
  readonly counts: Record<string, number> | undefined;
  readonly title: string;
}) {
  const entries = Object.entries(counts ?? {}).reduce<[string, number][]>(
    (sortedEntries, entry) => {
      const insertBefore = sortedEntries.findIndex((existingEntry) => entry[1] > existingEntry[1]);

      if (insertBefore === -1) {
        return [...sortedEntries, entry];
      }

      return [...sortedEntries.slice(0, insertBefore), entry, ...sortedEntries.slice(insertBefore)];
    },
    [],
  );

  return (
    <section className="countGroup">
      <h3>{title}</h3>
      {entries.length ? (
        <ul className="countList">
          {entries.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mutedCopy">No imported rows yet.</p>
      )}
    </section>
  );
}

function AdminSmokePage() {
  const health = trpc.health.useQuery();
  const utils = trpc.useUtils();
  const operations = trpc.operations.getOverview.useQuery();
  const discoverLatestSource = trpc.operations.discoverLatestKppSource.useMutation({
    onSuccess: async () => {
      await utils.operations.getOverview.invalidate();
    },
  });
  const stageLatestSource = trpc.operations.stageLatestKppSource.useMutation({
    onSuccess: async () => {
      await utils.operations.getOverview.invalidate();
    },
    onError: async () => {
      await utils.operations.getOverview.invalidate();
    },
  });
  const importCurrentCatalogue = trpc.operations.importCurrentKppCatalogue.useMutation({
    onSuccess: async () => {
      await utils.operations.getOverview.invalidate();
    },
    onError: async () => {
      await utils.operations.getOverview.invalidate();
    },
  });
  const latestRun = operations.data?.runs[0];
  const latestStagingRun = operations.data?.runs.find(
    (run) => run.operationKey === "kpp-source-staging",
  );
  const latestSource = latestRun?.source;
  const handleDiscoverLatestSource = useEffectEvent(() => {
    discoverLatestSource.mutate();
  });
  const handleStageLatestSource = useEffectEvent(() => {
    stageLatestSource.mutate();
  });
  const handleImportCurrentCatalogue = useEffectEvent(() => {
    importCurrentCatalogue.mutate();
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
            <button
              aria-label="Stage latest KPP source"
              className="iconActionButton"
              disabled={!latestSource || stageLatestSource.isPending}
              onClick={handleStageLatestSource}
              title="Stage latest KPP source"
              type="button"
            >
              <CloudUpload aria-hidden="true" size={18} />
            </button>
            <button
              aria-label="Import current KPP catalogue"
              className="iconActionButton"
              disabled={
                latestStagingRun?.staging?.status !== "staged" || importCurrentCatalogue.isPending
              }
              onClick={handleImportCurrentCatalogue}
              title="Import current KPP catalogue"
              type="button"
            >
              <Database aria-hidden="true" size={18} />
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
            <div className="statCard statCardWide">
              <dt>Current public KPP rows</dt>
              <dd>{operations.data?.catalogue.totalPublicEntities ?? "-"}</dd>
            </div>
          </dl>
          <div className="catalogueCounts">
            <CountList counts={operations.data?.catalogue.byType} title="Type" />
            <CountList counts={operations.data?.catalogue.byLegalForm} title="Legal form" />
            <CountList counts={operations.data?.catalogue.byOwnershipForm} title="Ownership" />
            <CountList counts={operations.data?.catalogue.byFinancingForm} title="Financing" />
            <CountList counts={operations.data?.catalogue.byLocation} title="Location" />
          </div>
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
          {stageLatestSource.error ? (
            <p className="error">{stageLatestSource.error.message}</p>
          ) : null}
          {importCurrentCatalogue.error ? (
            <p className="error">{importCurrentCatalogue.error.message}</p>
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

          {latestStagingRun?.staging ? (
            <dl className="stagingGrid">
              <div>
                <dt>Staging status</dt>
                <dd>
                  <span
                    className={
                      latestStagingRun.staging.status === "staged"
                        ? "stageBadge stageBadgeOk"
                        : "stageBadge stageBadgeFailed"
                    }
                  >
                    {latestStagingRun.staging.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Retention</dt>
                <dd>{latestStagingRun.staging.retention.status}</dd>
              </div>
              <div>
                <dt>Deletion status</dt>
                <dd>{latestStagingRun.staging.retention.deletionStatus}</dd>
              </div>
              <div>
                <dt>Delete after</dt>
                <dd>{latestStagingRun.staging.retention.deleteAfter}</dd>
              </div>
              <div className="sourceSpan">
                <dt>R2 key</dt>
                <dd>{latestStagingRun.staging.r2Key ?? "-"}</dd>
              </div>
              <div>
                <dt>Bytes</dt>
                <dd>{latestStagingRun.staging.byteSize ?? "-"}</dd>
              </div>
              <div>
                <dt>Checksum</dt>
                <dd>{latestStagingRun.staging.checksumSha256 ?? "-"}</dd>
              </div>
            </dl>
          ) : null}

          {operations.data?.runs.length ? (
            <ul className="runList">
              {operations.data.runs.map((run) => (
                <li className="runRow" key={run.id}>
                  <div>
                    <p className="runTitle">{run.sourceLabel}</p>
                    <p className="runMeta">
                      {run.kind} · {run.operationKey} · {run.status}
                    </p>
                    {run.staging ? (
                      <p className="runMeta">
                        staging {run.staging.status} · deletion{" "}
                        {run.staging.retention.deletionStatus} · delete after{" "}
                        {run.staging.retention.deleteAfter}
                      </p>
                    ) : null}
                    {run.error ? <p className="runError">{run.error.message}</p> : null}
                  </div>
                  <span className="runCount">
                    {run.staging?.byteSize ?? run.counters.processed}
                  </span>
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
