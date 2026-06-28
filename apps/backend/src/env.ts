export interface AppBindings {
  readonly ENVIRONMENT?: string;
  readonly SENTRY_DSN?: string;
  readonly DB?: Hyperdrive;
  readonly KPP_STAGING_BUCKET?: R2Bucket;
  readonly INGESTION_QUEUE?: Queue;
  readonly KRS_ENRICHMENT_QUEUE?: Queue;
}
