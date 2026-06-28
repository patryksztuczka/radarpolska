import { Effect } from "effect";

export interface OperationsRun {
  readonly id: string;
  readonly kind: "import" | "enrichment";
  readonly operationKey: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string | null;
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

export function getOperationsOverview() {
  return Effect.succeed(emptyOverview);
}
