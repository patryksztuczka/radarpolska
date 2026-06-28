import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Effect } from "effect";

import type { AppBindings } from "./env";
import { getHealth } from "./modules/health/service";
import {
  createOperationsServices,
  createInMemoryPublicEntityCatalogueStore,
  createPostgresPublicEntityCatalogueStore,
  createR2TemporaryKppSourceStorage,
  type OperationsServices,
} from "./modules/operations/service";
import { createTrpcContext } from "./trpc/context";
import { appRouter } from "./trpc/router";

type AppEnv = { Bindings: AppBindings };

interface CreateAppOptions {
  readonly operations?: Partial<OperationsServices>;
}

export function createApp(options?: CreateAppOptions) {
  const app = new Hono<AppEnv>();
  const operations = createOperationsServices(options?.operations);
  const localCatalogue = createInMemoryPublicEntityCatalogueStore();
  let dbCatalogue: OperationsServices["catalogue"] = null;

  app.use(
    "/trpc/*",
    cors({
      origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type"],
    }),
  );

  app.get("/", (c) => c.text("radarpolska backend"));
  app.get("/api/health", (c) => c.json(Effect.runSync(getHealth())));
  app.use(
    "/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/trpc",
      createContext: (_opts, c) => {
        const env = c.env ?? {};

        return createTrpcContext(env, {
          ...operations,
          catalogue:
            operations.catalogue ??
            (env.DB?.connectionString
              ? (dbCatalogue ??= createPostgresPublicEntityCatalogueStore(env.DB.connectionString))
              : localCatalogue),
          storage:
            operations.storage ??
            (env.KPP_STAGING_BUCKET
              ? createR2TemporaryKppSourceStorage(env.KPP_STAGING_BUCKET)
              : null),
        });
      },
    }),
  );

  return app;
}

export default createApp();
