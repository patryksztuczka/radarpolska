import { describe, expect, it } from "vitest";

import { createApp } from "./index";
import type { HealthCheck } from "./modules/health/service";

interface TrpcHealthResponse {
  readonly result: {
    readonly data: {
      readonly json: HealthCheck;
    };
  };
}

describe("backend app", () => {
  it("returns a health payload from the HTTP route", async () => {
    const response = await createApp().request("/api/health");
    const body = (await response.json()) as HealthCheck;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      service: "radarpolska-backend",
    });
    expect(new Date(body.checkedAt).toString()).not.toBe("Invalid Date");
  });

  it("serves the tRPC health procedure", async () => {
    const response = await createApp().request("/trpc/health");
    const body = (await response.json()) as TrpcHealthResponse;

    expect(response.status).toBe(200);
    expect(body.result.data.json).toMatchObject({
      status: "ok",
      service: "radarpolska-backend",
    });
  });
});
