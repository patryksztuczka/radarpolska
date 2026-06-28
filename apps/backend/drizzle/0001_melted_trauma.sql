ALTER TABLE "operation_runs" ADD COLUMN "source" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "operation_runs" ADD COLUMN "staging" jsonb DEFAULT 'null'::jsonb;