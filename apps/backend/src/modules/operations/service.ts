export interface KppSourceMetadata {
  readonly datasetId: string;
  readonly datasetTitle: string;
  readonly resourceId: string;
  readonly resourceTitle: string;
  readonly resourceDataDate: string;
  readonly resourceDownloadUrl: string;
  readonly resourceFormat: string;
}

export interface OperationsRun {
  readonly id: string;
  readonly kind: "import" | "enrichment";
  readonly operationKey: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string | null;
  readonly source: KppSourceMetadata | null;
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

export interface OperationsServices {
  readonly fetch: typeof fetch;
  readonly store: OperationsRunStore;
}

interface DiscoverLatestKppSourceOptions {
  readonly fetch: typeof fetch;
  readonly store: OperationsRunStore;
}

interface GetOperationsOverviewOptions {
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
const kppResourcesUrl =
  "https://api.dane.gov.pl/datasets/3520,dane-podmiotow-swiadczacych-usugi-publiczne-z-kat/resources?page=1";

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

export function createOperationsServices(
  overrides?: Partial<OperationsServices>,
): OperationsServices {
  return {
    fetch: overrides?.fetch ?? fetch,
    store: overrides?.store ?? createInMemoryOperationsRunStore(),
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
