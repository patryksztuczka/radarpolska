import type { AppBindings } from "../env";
import type { OperationsServices } from "../modules/operations/service";

export interface TrpcContext extends Record<string, unknown> {
  readonly env: AppBindings;
  readonly operations: OperationsServices;
}

export function createTrpcContext(env: AppBindings, operations: OperationsServices): TrpcContext {
  return { env, operations };
}
