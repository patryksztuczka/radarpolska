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

interface TrpcOperationsOverviewResponse {
  readonly result: {
    readonly data: {
      readonly json: {
        readonly summary: {
          readonly totalRuns: number;
          readonly activeRuns: number;
          readonly successfulRuns: number;
          readonly failedRuns: number;
          readonly lastCompletedAt: string | null;
        };
        readonly runs: readonly unknown[];
      };
    };
  };
}

interface TrpcDiscoverSourceResponse {
  readonly result: {
    readonly data: {
      readonly json: {
        readonly operationKey: string;
        readonly source: {
          readonly resourceId: string;
          readonly resourceDataDate: string;
          readonly resourceTitle: string;
          readonly resourceDownloadUrl: string;
        } | null;
      };
    };
  };
}

interface TrpcStageSourceResponse {
  readonly result: {
    readonly data: {
      readonly json: {
        readonly operationKey: string;
        readonly staging: {
          readonly status: string;
          readonly r2Key: string | null;
          readonly byteSize: number | null;
          readonly checksumSha256: string | null;
          readonly retention: {
            readonly deleteAfter: string;
            readonly deleteAfterDays: number;
            readonly deletionStatus: string;
            readonly lifecycle: string;
            readonly status: string;
          };
        } | null;
      };
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

  it("serves an empty operations overview before importers exist", async () => {
    const response = await createApp().request("/trpc/operations.getOverview");
    const body = (await response.json()) as TrpcOperationsOverviewResponse;

    expect(response.status).toBe(200);
    expect(body.result.data.json).toEqual({
      summary: {
        totalRuns: 0,
        activeRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastCompletedAt: null,
      },
      runs: [],
    });
  });

  it("discovers the latest KPP resource through tRPC and exposes it in the overview", async () => {
    const app = createApp({
      operations: {
        fetch: async () =>
          Response.json({
            data: [
              {
                id: "2150707",
                attributes: {
                  title:
                    "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych - czerwiec 2026",
                  format: "csv",
                  data_date: "2026-06-26",
                  download_url:
                    "https://api.dane.gov.pl/resources/2150707,dane-podmiotow-swiadczacych-usugi-publiczne-z-katalogu-podmiotow-publicznych-czerwiec-2026/file",
                  csv_download_url: null,
                  file_url: "https://api.dane.gov.pl/media/resources/20260626/export_gov.csv",
                  csv_file_url: null,
                },
              },
            ],
            links: {},
          }),
      },
    });

    const discoverResponse = await app.request("/trpc/operations.discoverLatestKppSource", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });
    const discoverBody = (await discoverResponse.json()) as TrpcDiscoverSourceResponse;
    const overviewResponse = await app.request("/trpc/operations.getOverview");
    const overviewBody = (await overviewResponse.json()) as TrpcOperationsOverviewResponse;

    expect(discoverResponse.status).toBe(200);
    expect(discoverBody.result.data.json).toMatchObject({
      operationKey: "kpp-source-discovery",
      source: {
        resourceId: "2150707",
        resourceDataDate: "2026-06-26",
        resourceTitle:
          "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych - czerwiec 2026",
        resourceDownloadUrl:
          "https://api.dane.gov.pl/resources/2150707,dane-podmiotow-swiadczacych-usugi-publiczne-z-katalogu-podmiotow-publicznych-czerwiec-2026/file",
      },
    });
    expect(overviewResponse.status).toBe(200);
    expect(overviewBody.result.data.json.summary.totalRuns).toBe(1);
    expect(overviewBody.result.data.json.runs).toHaveLength(1);
  });

  it("stages the latest KPP resource through tRPC and exposes staging metadata", async () => {
    const app = createApp({
      operations: {
        fetch: async (input) => {
          if (String(input).endsWith("/kpp.csv")) {
            return new Response("id,name\n1,urzad\n", {
              headers: {
                "content-type": "text/csv",
              },
            });
          }

          return Response.json({
            data: [
              {
                id: "2150707",
                attributes: {
                  title:
                    "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych - czerwiec 2026",
                  format: "csv",
                  data_date: "2026-06-26",
                  download_url: "https://example.test/kpp.csv",
                  csv_download_url: null,
                  file_url: "https://example.test/kpp.csv",
                  csv_file_url: null,
                },
              },
            ],
            links: {},
          });
        },
        storage: {
          async putTemporaryObject() {},
          async deleteTemporaryObject() {},
        },
      },
    });

    await app.request("/trpc/operations.discoverLatestKppSource", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });
    const stageResponse = await app.request("/trpc/operations.stageLatestKppSource", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });
    const stageBody = (await stageResponse.json()) as TrpcStageSourceResponse;
    const overviewResponse = await app.request("/trpc/operations.getOverview");
    const overviewBody = (await overviewResponse.json()) as TrpcOperationsOverviewResponse;

    expect(stageResponse.status).toBe(200);
    expect(stageBody.result.data.json).toMatchObject({
      operationKey: "kpp-source-staging",
      staging: {
        status: "staged",
        r2Key: expect.stringMatching(/^tmp\/kpp\/2150707\/[0-9a-f-]{36}\.csv$/),
        byteSize: 16,
        checksumSha256: "adfb7dc69d27b66f7d1bfc9679af62da34085af9c8113b7c990355dc74b2b807",
        retention: {
          deleteAfter: expect.any(String),
          deleteAfterDays: 7,
          deletionStatus: "pending",
          lifecycle: "delete-after-7-days",
          status: "temporary",
        },
      },
    });
    expect(overviewBody.result.data.json.summary.totalRuns).toBe(2);
    expect(overviewBody.result.data.json.runs).toHaveLength(2);
  });

  it("deletes expired KPP staging objects through tRPC and exposes the retention transition", async () => {
    const deletedKeys: string[] = [];
    const app = createApp({
      operations: {
        fetch: async (input) => {
          if (String(input).endsWith("/kpp.csv")) {
            return new Response("id,name\n1,urzad\n");
          }

          return Response.json({
            data: [
              {
                id: "2150707",
                attributes: {
                  title:
                    "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych - czerwiec 2026",
                  format: "csv",
                  data_date: "2026-06-26",
                  download_url: "https://example.test/kpp.csv",
                  csv_download_url: null,
                  file_url: "https://example.test/kpp.csv",
                  csv_file_url: null,
                },
              },
            ],
            links: {},
          });
        },
        storage: {
          async putTemporaryObject() {},
          async deleteTemporaryObject(key) {
            deletedKeys.push(key);
          },
        },
      },
    });

    await app.request("/trpc/operations.discoverLatestKppSource", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });
    const stageResponse = await app.request("/trpc/operations.stageLatestKppSource", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });
    const stageBody = (await stageResponse.json()) as TrpcStageSourceResponse;
    const cleanupResponse = await app.request(
      "/trpc/operations.deleteExpiredTemporaryKppStagingObjects",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          json: {
            now: stageBody.result.data.json.staging?.retention.deleteAfter,
          },
        }),
      },
    );
    const overviewResponse = await app.request("/trpc/operations.getOverview");
    const overviewBody = (await overviewResponse.json()) as TrpcOperationsOverviewResponse;

    expect(cleanupResponse.status).toBe(200);
    expect(deletedKeys).toEqual([stageBody.result.data.json.staging?.r2Key]);
    expect(
      overviewBody.result.data.json.runs.find(
        (run) =>
          typeof run === "object" &&
          run !== null &&
          "operationKey" in run &&
          run.operationKey === "kpp-source-staging",
      ),
    ).toMatchObject({
      staging: {
        retention: {
          deletionStatus: "deleted",
        },
      },
    });
  });

  it("records failed KPP staging attempts through tRPC", async () => {
    const app = createApp({
      operations: {
        fetch: async (input) => {
          if (String(input).endsWith("/kpp.csv")) {
            return new Response("id,name\n1,urzad\n");
          }

          return Response.json({
            data: [
              {
                id: "2150707",
                attributes: {
                  title:
                    "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych - czerwiec 2026",
                  format: "csv",
                  data_date: "2026-06-26",
                  download_url: "https://example.test/kpp.csv",
                  csv_download_url: null,
                  file_url: "https://example.test/kpp.csv",
                  csv_file_url: null,
                },
              },
            ],
            links: {},
          });
        },
      },
    });

    await app.request("/trpc/operations.discoverLatestKppSource", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });
    const stageResponse = await app.request("/trpc/operations.stageLatestKppSource", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{}",
    });
    const overviewResponse = await app.request("/trpc/operations.getOverview");
    const overviewBody = (await overviewResponse.json()) as TrpcOperationsOverviewResponse;

    expect(stageResponse.status).toBe(500);
    expect(overviewBody.result.data.json.summary).toMatchObject({
      totalRuns: 2,
      failedRuns: 1,
    });
    expect(
      overviewBody.result.data.json.runs.find(
        (run) =>
          typeof run === "object" &&
          run !== null &&
          "operationKey" in run &&
          run.operationKey === "kpp-source-staging",
      ),
    ).toMatchObject({
      operationKey: "kpp-source-staging",
      status: "failed",
      staging: {
        status: "failed",
        retention: {
          deleteAfter: expect.any(String),
          deletionStatus: "pending",
          status: "temporary",
        },
      },
    });
  });
});
