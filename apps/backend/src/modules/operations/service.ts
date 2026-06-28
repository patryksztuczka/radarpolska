import { createHash } from "node:crypto";

export interface KppSourceMetadata {
  readonly datasetId: string;
  readonly datasetTitle: string;
  readonly resourceId: string;
  readonly resourceTitle: string;
  readonly resourceDataDate: string;
  readonly resourceDownloadUrl: string;
  readonly resourceFormat: string;
}

export interface KppSourceStagingMetadata {
  readonly status: "staged" | "failed";
  readonly r2Key: string | null;
  readonly byteSize: number | null;
  readonly checksumSha256: string | null;
  readonly retention: {
    readonly deleteAfter: string;
    readonly deleteAfterDays: number;
    readonly deletionStatus: "pending" | "deleted" | "failed";
    readonly lifecycle: "delete-after-7-days";
    readonly status: "temporary";
  };
}

export interface OperationsRun {
  readonly id: string;
  readonly kind: "import" | "enrichment";
  readonly operationKey: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string | null;
  readonly source: KppSourceMetadata | null;
  readonly staging: KppSourceStagingMetadata | null;
  readonly trigger: "manual" | "scheduled" | "system";
  readonly status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "partially_failed"
    | "cancelled";
  readonly counters: {
    readonly discovered: number;
    readonly queued: number;
    readonly processed: number;
    readonly created: number;
    readonly updated: number;
    readonly skipped: number;
    readonly failed: number;
  };
  readonly timing: {
    readonly queuedAt: string;
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
  };
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly details: Record<string, string | number | boolean | null> | null;
  } | null;
}

export interface OperationsOverview {
  readonly summary: {
    readonly totalRuns: number;
    readonly activeRuns: number;
    readonly successfulRuns: number;
    readonly failedRuns: number;
    readonly lastCompletedAt: string | null;
  };
  readonly runs: readonly OperationsRun[];
}

interface OperationsRunStore {
  list(): readonly OperationsRun[];
  save(run: OperationsRun): OperationsRun;
  findByOperationKey(operationKey: string): OperationsRun | undefined;
}

export interface TemporaryKppSourceStorage {
  putTemporaryObject(input: {
    readonly key: string;
    readonly body: ReadableStream<Uint8Array>;
    readonly metadata: Record<string, string>;
    readonly contentType: string | null;
  }): Promise<void>;
  deleteTemporaryObject(key: string): Promise<void>;
}

export interface OperationsServices {
  readonly fetch: typeof fetch;
  readonly store: OperationsRunStore;
  readonly storage: TemporaryKppSourceStorage | null;
}

interface DiscoverLatestKppSourceOptions {
  readonly fetch: typeof fetch;
  readonly store: OperationsRunStore;
}

interface GetOperationsOverviewOptions {
  readonly store: OperationsRunStore;
}

interface StageLatestKppSourceOptions {
  readonly fetch: typeof fetch;
  readonly storage: TemporaryKppSourceStorage;
  readonly store: OperationsRunStore;
}

interface DeleteExpiredTemporaryKppStagingObjectsOptions {
  readonly now?: Date;
  readonly storage: TemporaryKppSourceStorage;
  readonly store: OperationsRunStore;
}

interface KppDatasetResourceResponse {
  readonly data: readonly KppDatasetResource[];
  readonly links?: {
    readonly next?: string;
  };
}

interface KppDatasetResource {
  readonly id: string;
  readonly attributes: {
    readonly title: string;
    readonly format: string;
    readonly data_date: string;
    readonly download_url: string;
    readonly csv_download_url: string | null;
    readonly file_url: string | null;
    readonly csv_file_url: string | null;
  };
}

const kppDatasetId = "3520";
const kppDatasetTitle =
  "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych";
const kppDiscoveryOperationKey = "kpp-source-discovery";
const kppStagingOperationKey = "kpp-source-staging";
const kppResourcesUrl =
  "https://api.dane.gov.pl/datasets/3520,dane-podmiotow-swiadczacych-usugi-publiczne-z-kat/resources?page=1";
const temporaryRetentionDays = 7;
const temporaryRetentionLifecycle = "delete-after-7-days" as const;

const emptyOverview: OperationsOverview = {
  summary: {
    totalRuns: 0,
    activeRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    lastCompletedAt: null,
  },
  runs: [],
};

function createRunId() {
  return crypto.randomUUID();
}

function isCsvLikeUrl(url: string | null) {
  return typeof url === "string" && url.toLowerCase().endsWith(".csv");
}

function resolveKppCsvDownloadUrl(resource: KppDatasetResource) {
  if (resource.attributes.csv_download_url) {
    return resource.attributes.csv_download_url;
  }

  if (resource.attributes.format.toLowerCase() === "csv") {
    return resource.attributes.download_url;
  }

  if (
    isCsvLikeUrl(resource.attributes.file_url) ||
    isCsvLikeUrl(resource.attributes.csv_file_url)
  ) {
    return resource.attributes.download_url;
  }

  return null;
}

function compareResourceDates(left: KppDatasetResource, right: KppDatasetResource) {
  return left.attributes.data_date.localeCompare(right.attributes.data_date);
}

async function fetchKppResources(fetcher: typeof fetch) {
  async function loadPage(nextUrl: string, resources: readonly KppDatasetResource[]) {
    const response = await fetcher(nextUrl);

    if (!response.ok) {
      throw new Error(`KPP discovery failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as KppDatasetResourceResponse;
    const nextResources = [...resources, ...payload.data];

    if (!payload.links?.next) {
      return nextResources;
    }

    return loadPage(payload.links.next, nextResources);
  }

  return loadPage(kppResourcesUrl, []);
}

function createCompletedDiscoveryRun(
  source: KppSourceMetadata,
  existingRun?: OperationsRun,
): OperationsRun {
  const startedAt = new Date().toISOString();
  const finishedAt = new Date().toISOString();

  return {
    id: existingRun?.id ?? createRunId(),
    kind: "import",
    operationKey: kppDiscoveryOperationKey,
    sourceLabel: source.resourceTitle,
    sourceUrl: source.resourceDownloadUrl,
    source,
    staging: null,
    trigger: "manual",
    status: "completed",
    counters: {
      discovered: 1,
      queued: 0,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    },
    timing: {
      queuedAt: existingRun?.timing.queuedAt ?? startedAt,
      startedAt,
      finishedAt,
      durationMs: 0,
    },
    error: null,
  };
}

function createStagingRunBase(
  source: KppSourceMetadata,
  runId: string,
): Omit<OperationsRun, "status" | "timing" | "error" | "counters" | "staging"> {
  return {
    id: runId,
    kind: "import",
    operationKey: kppStagingOperationKey,
    sourceLabel: source.resourceTitle,
    sourceUrl: source.resourceDownloadUrl,
    source,
    trigger: "manual",
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "KPP source staging failed";
}

function createStagingObjectKey(source: KppSourceMetadata, runId: string) {
  return `tmp/kpp/${source.resourceId}/${runId}.csv`;
}

function createTemporaryRetention(stagedAt: string) {
  return {
    deleteAfter: new Date(
      Date.parse(stagedAt) + temporaryRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    deleteAfterDays: temporaryRetentionDays,
    deletionStatus: "pending" as const,
    lifecycle: temporaryRetentionLifecycle,
    status: "temporary" as const,
  };
}

function createTemporaryStagingMetadata(
  source: KppSourceMetadata,
  retention: KppSourceStagingMetadata["retention"],
) {
  return {
    "radarpolska.retention.deleteAfter": retention.deleteAfter,
    "radarpolska.retention.deleteAfterDays": String(retention.deleteAfterDays),
    "radarpolska.retention.deletionStatus": retention.deletionStatus,
    "radarpolska.retention.lifecycle": retention.lifecycle,
    "radarpolska.retention.status": "temporary",
    "radarpolska.source.resourceId": source.resourceId,
  };
}

async function checksumStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const hash = createHash("sha256");
  let byteSize = 0;

  async function readNextChunk(): Promise<void> {
    const chunk = await reader.read();

    if (chunk.done) {
      return;
    }

    byteSize += chunk.value.byteLength;
    hash.update(chunk.value);

    return readNextChunk();
  }

  try {
    await readNextChunk();
  } finally {
    reader.releaseLock();
  }

  return {
    byteSize,
    checksumSha256: hash.digest("hex"),
  };
}

export function createInMemoryOperationsRunStore(): OperationsRunStore {
  const runs = new Map<string, OperationsRun>();

  return {
    list() {
      return [...runs.values()].sort((left, right) =>
        right.timing.queuedAt.localeCompare(left.timing.queuedAt),
      );
    },
    save(run) {
      runs.set(run.id, run);
      return run;
    },
    findByOperationKey(operationKey) {
      return [...runs.values()].find((run) => run.operationKey === operationKey);
    },
  };
}

export function createR2TemporaryKppSourceStorage(bucket: R2Bucket): TemporaryKppSourceStorage {
  return {
    async putTemporaryObject({ key, body, metadata, contentType }) {
      await bucket.put(key, body, {
        customMetadata: metadata,
        httpMetadata: contentType ? { contentType } : undefined,
      });
    },
    async deleteTemporaryObject(key) {
      await bucket.delete(key);
    },
  };
}

export function createOperationsServices(
  overrides?: Partial<OperationsServices>,
): OperationsServices {
  return {
    fetch: overrides?.fetch ?? fetch,
    store: overrides?.store ?? createInMemoryOperationsRunStore(),
    storage: overrides?.storage ?? null,
  };
}

export async function discoverLatestKppSource({
  fetch: fetcher,
  store,
}: DiscoverLatestKppSourceOptions) {
  const resources = await fetchKppResources(fetcher);

  if (!resources.length) {
    throw new Error("KPP dataset does not expose any resources");
  }

  const latestSupportedResource = [...resources]
    .sort(compareResourceDates)
    .reverse()
    .find((resource) => resolveKppCsvDownloadUrl(resource));

  if (!latestSupportedResource) {
    throw new Error("KPP dataset does not expose a supported CSV resource");
  }

  const resourceDownloadUrl = resolveKppCsvDownloadUrl(latestSupportedResource);

  if (!resourceDownloadUrl) {
    throw new Error("KPP dataset does not expose a supported CSV resource");
  }

  const source: KppSourceMetadata = {
    datasetId: kppDatasetId,
    datasetTitle: kppDatasetTitle,
    resourceId: latestSupportedResource.id,
    resourceTitle: latestSupportedResource.attributes.title,
    resourceDataDate: latestSupportedResource.attributes.data_date,
    resourceDownloadUrl,
    resourceFormat: latestSupportedResource.attributes.format,
  };

  const run = createCompletedDiscoveryRun(
    source,
    store.findByOperationKey(kppDiscoveryOperationKey),
  );

  return store.save(run);
}

export async function stageLatestKppSource({
  fetch: fetcher,
  storage,
  store,
}: StageLatestKppSourceOptions) {
  const discoveryRun = store.findByOperationKey(kppDiscoveryOperationKey);
  const source = discoveryRun?.source;

  if (!source) {
    throw new Error("KPP source must be discovered before staging");
  }

  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const baseRun = createStagingRunBase(source, runId);
  const key = createStagingObjectKey(source, runId);
  const retention = createTemporaryRetention(startedAt);

  try {
    const response = await fetcher(source.resourceDownloadUrl);

    if (!response.ok) {
      throw new Error(`KPP staging download failed with HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("KPP staging download did not return a response body");
    }

    const [storageBody, checksumBody] = response.body.tee();
    const [{ byteSize, checksumSha256 }] = await Promise.all([
      checksumStream(checksumBody),
      storage.putTemporaryObject({
        key,
        body: storageBody,
        metadata: createTemporaryStagingMetadata(source, retention),
        contentType: response.headers.get("content-type"),
      }),
    ]);
    const finishedAt = new Date().toISOString();

    return store.save({
      ...baseRun,
      status: "completed",
      counters: {
        discovered: 0,
        queued: 0,
        processed: 1,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
      },
      timing: {
        queuedAt: startedAt,
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      },
      staging: {
        status: "staged",
        r2Key: key,
        byteSize,
        checksumSha256,
        retention,
      },
      error: null,
    });
  } catch (error) {
    const finishedAt = new Date().toISOString();

    store.save({
      ...baseRun,
      status: "failed",
      counters: {
        discovered: 0,
        queued: 0,
        processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 1,
      },
      timing: {
        queuedAt: startedAt,
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      },
      staging: {
        status: "failed",
        r2Key: key,
        byteSize: null,
        checksumSha256: null,
        retention,
      },
      error: {
        code: "KPP_STAGING_FAILED",
        message: getErrorMessage(error),
        retryable: true,
        details: null,
      },
    });

    throw error;
  }
}

export async function deleteExpiredTemporaryKppStagingObjects({
  now = new Date(),
  storage,
  store,
}: DeleteExpiredTemporaryKppStagingObjectsOptions) {
  const expiredRuns = store.list().filter((run) => {
    if (!run.staging?.r2Key) {
      return false;
    }

    if (run.staging.retention.deletionStatus !== "pending") {
      return false;
    }

    return Date.parse(run.staging.retention.deleteAfter) <= now.getTime();
  });

  async function deleteNext(index: number): Promise<readonly OperationsRun[]> {
    const run = expiredRuns[index];

    if (!run?.staging?.r2Key) {
      return [];
    }

    try {
      await storage.deleteTemporaryObject(run.staging.r2Key);

      const updatedRun = store.save({
        ...run,
        staging: {
          ...run.staging,
          retention: {
            ...run.staging.retention,
            deletionStatus: "deleted",
          },
        },
      });

      return [updatedRun, ...(await deleteNext(index + 1))];
    } catch (error) {
      store.save({
        ...run,
        status: "partially_failed",
        counters: {
          ...run.counters,
          failed: run.counters.failed + 1,
        },
        staging: {
          ...run.staging,
          retention: {
            ...run.staging.retention,
            deletionStatus: "failed",
          },
        },
        error: {
          code: "KPP_STAGING_RETENTION_DELETE_FAILED",
          message: getErrorMessage(error),
          retryable: true,
          details: {
            r2Key: run.staging.r2Key,
          },
        },
      });

      throw error;
    }
  }

  return deleteNext(0);
}

export async function getOperationsOverview({
  store,
}: GetOperationsOverviewOptions): Promise<OperationsOverview> {
  const runs = store.list();

  if (!runs.length) {
    return emptyOverview;
  }

  const completedRuns = runs.filter((run) => run.status === "completed");
  const failedRuns = runs.filter(
    (run) => run.status === "failed" || run.status === "partially_failed",
  );
  const activeRuns = runs.filter((run) => run.status === "pending" || run.status === "running");
  const lastCompletedRun = [...completedRuns].sort(
    (left, right) => right.timing.finishedAt?.localeCompare(left.timing.finishedAt ?? "") ?? 0,
  )[0];

  return {
    summary: {
      totalRuns: runs.length,
      activeRuns: activeRuns.length,
      successfulRuns: completedRuns.length,
      failedRuns: failedRuns.length,
      lastCompletedAt: lastCompletedRun?.timing.finishedAt ?? null,
    },
    runs,
  };
}
