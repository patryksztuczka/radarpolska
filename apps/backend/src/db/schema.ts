import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const runKinds = ["import", "enrichment"] as const;
export const runStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
  "partially_failed",
  "cancelled",
] as const;
export const runTriggers = ["manual", "scheduled", "system"] as const;

export interface RunCounters {
  readonly discovered: number;
  readonly queued: number;
  readonly processed: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
}

export interface RunErrorShape {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details: Record<string, string | number | boolean | null> | null;
}

export const operationRuns = pgTable("operation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind", { enum: runKinds }).notNull(),
  operationKey: text("operation_key").notNull(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
  trigger: text("trigger", { enum: runTriggers }).notNull().default("system"),
  status: text("status", { enum: runStatuses }).notNull().default("pending"),
  counters: jsonb("counters").$type<RunCounters>().notNull().default({
    discovered: 0,
    queued: 0,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  }),
  error: jsonb("error").$type<RunErrorShape | null>().default(null),
  queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
