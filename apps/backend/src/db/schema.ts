import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const importRuns = pgTable("import_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed", "partially_failed"],
  }).notNull(),
  counters: jsonb("counters").$type<Record<string, number>>().notNull().default({}),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
