CREATE TABLE "operation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"operation_key" text NOT NULL,
	"source_label" text NOT NULL,
	"source_url" text,
	"trigger" text DEFAULT 'system' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"counters" jsonb DEFAULT '{"discovered":0,"queued":0,"processed":0,"created":0,"updated":0,"skipped":0,"failed":0}'::jsonb NOT NULL,
	"error" jsonb DEFAULT 'null'::jsonb,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
