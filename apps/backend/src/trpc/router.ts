import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { Effect } from "effect";

import { getHealth } from "../modules/health/service";
import type { TrpcContext } from "./context";

const trpc = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const appRouter = trpc.router({
  health: trpc.procedure.query(() => Effect.runSync(getHealth())),
});

export type AppRouter = typeof appRouter;
