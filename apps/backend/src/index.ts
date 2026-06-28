import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Effect } from "effect";

import type { AppBindings } from "./env";
import { getHealth } from "./modules/health/service";
import { createTrpcContext } from "./trpc/context";
import { appRouter } from "./trpc/router";

type AppEnv = { Bindings: AppBindings };

export function createApp() {
  const app = new Hono<AppEnv>();

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
      createContext: (_opts, c) => createTrpcContext(c.env),
    }),
  );

  return app;
}

export default createApp();
