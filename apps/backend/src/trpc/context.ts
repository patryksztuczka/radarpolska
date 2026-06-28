import type { AppBindings } from "../env";

export interface TrpcContext extends Record<string, unknown> {
  readonly env: AppBindings;
}

export function createTrpcContext(env: AppBindings): TrpcContext {
  return { env };
}
