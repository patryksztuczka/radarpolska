import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { Effect } from "effect";

import { getHealth } from "../modules/health/service";
import {
  deleteExpiredTemporaryKppStagingObjects,
  discoverLatestKppSource,
  getOperationsOverview,
  stageLatestKppSource,
} from "../modules/operations/service";
import type { TrpcContext } from "./context";

const trpc = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const appRouter = trpc.router({
  health: trpc.procedure.query(() => Effect.runSync(getHealth())),
  operations: trpc.router({
    getOverview: trpc.procedure.query(({ ctx }) => getOperationsOverview(ctx.operations)),
    discoverLatestKppSource: trpc.procedure.mutation(({ ctx }) =>
      discoverLatestKppSource(ctx.operations),
    ),
    stageLatestKppSource: trpc.procedure.mutation(({ ctx }) =>
      stageLatestKppSource({
        fetch: ctx.operations.fetch,
        storage: ctx.operations.storage ?? {
          async putTemporaryObject() {
            throw new Error("KPP staging storage is not configured");
          },
          async deleteTemporaryObject() {
            throw new Error("KPP staging storage is not configured");
          },
        },
        store: ctx.operations.store,
      }),
    ),
    deleteExpiredTemporaryKppStagingObjects: trpc.procedure.mutation(({ ctx }) =>
      deleteExpiredTemporaryKppStagingObjects({
        storage: ctx.operations.storage ?? {
          async putTemporaryObject() {
            throw new Error("KPP staging storage is not configured");
          },
          async deleteTemporaryObject() {
            throw new Error("KPP staging storage is not configured");
          },
        },
        store: ctx.operations.store,
      }),
    ),
  }),
});

export type AppRouter = typeof appRouter;
