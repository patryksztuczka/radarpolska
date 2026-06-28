import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { Effect } from "effect";

import { getHealth } from "../modules/health/service";
import { discoverLatestKppSource, getOperationsOverview } from "../modules/operations/service";
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
  }),
});

export type AppRouter = typeof appRouter;
