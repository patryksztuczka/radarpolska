CREATE TABLE "current_public_entity_catalogue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_system" text DEFAULT 'KPP' NOT NULL,
	"source_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"legal_form" text NOT NULL,
	"ownership_form" text NOT NULL,
	"financing_form" text NOT NULL,
	"location" jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "current_public_entity_catalogue_source_id_unique" UNIQUE("source_id")
);
