import { describe, expect, it, vi } from "vitest";

import {
  createInMemoryOperationsRunStore,
  discoverLatestKppSource,
  getOperationsOverview,
  stageLatestKppSource,
  type TemporaryKppSourceStorage,
} from "./service";

const kppResourcesUrl =
  "https://api.dane.gov.pl/datasets/3520,dane-podmiotow-swiadczacych-usugi-publiczne-z-kat/resources?page=1";

describe("operations service", () => {
  it("stages a discovered KPP source in temporary storage and records checksum metadata", async () => {
    const store = createInMemoryOperationsRunStore();
    const sourceBody = "id,name\n1,urzad\n";
    const uploadedObjects: {
      readonly key: string;
      readonly body: string;
      readonly metadata: Record<string, string>;
    }[] = [];
    const storage: TemporaryKppSourceStorage = {
      async putTemporaryObject({ key, body, metadata }) {
        uploadedObjects.push({
          key,
          body: await new Response(body).text(),
          metadata,
        });
      },
    };

    await discoverLatestKppSource({
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
                download_url: "https://example.test/kpp.csv",
                csv_download_url: null,
                file_url: "https://example.test/kpp.csv",
                csv_file_url: null,
              },
            },
          ],
          links: {},
        }),
      store,
    });

    await stageLatestKppSource({
      fetch: async (input) => {
        expect(String(input)).toBe("https://example.test/kpp.csv");

        return new Response(sourceBody, {
          headers: {
            "content-type": "text/csv",
          },
        });
      },
      storage,
      store,
    });

    const overview = await getOperationsOverview({ store });
    const stagingRun = overview.runs.find((run) => run.operationKey === "kpp-source-staging");

    expect(uploadedObjects).toEqual([
      {
        key: expect.stringMatching(/^tmp\/kpp\/2150707\/[0-9a-f-]{36}\.csv$/),
        body: sourceBody,
        metadata: {
          "radarpolska.retention.deleteAfter": expect.any(String),
          "radarpolska.retention.deletionStatus": "pending",
          "radarpolska.retention.lifecycle": "delete-after-7-days",
          "radarpolska.retention.status": "temporary",
          "radarpolska.source.resourceId": "2150707",
        },
      },
    ]);
    expect(stagingRun).toMatchObject({
      operationKey: "kpp-source-staging",
      status: "completed",
      staging: {
        status: "staged",
        r2Key: uploadedObjects[0]?.key,
        byteSize: 16,
        checksumSha256: "adfb7dc69d27b66f7d1bfc9679af62da34085af9c8113b7c990355dc74b2b807",
        retention: {
          deleteAfter: uploadedObjects[0]?.metadata["radarpolska.retention.deleteAfter"],
          deleteAfterDays: 7,
          deletionStatus: "pending",
          lifecycle: "delete-after-7-days",
          status: "temporary",
        },
      },
    });
    expect(
      Date.parse(uploadedObjects[0]?.metadata["radarpolska.retention.deleteAfter"] ?? ""),
    ).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it("records failed KPP source staging attempts in the operations overview", async () => {
    const store = createInMemoryOperationsRunStore();
    const storage: TemporaryKppSourceStorage = {
      async putTemporaryObject() {
        throw new Error("R2 is unavailable");
      },
    };

    await discoverLatestKppSource({
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
                download_url: "https://example.test/kpp.csv",
                csv_download_url: null,
                file_url: "https://example.test/kpp.csv",
                csv_file_url: null,
              },
            },
          ],
          links: {},
        }),
      store,
    });

    await expect(
      stageLatestKppSource({
        fetch: async () => new Response("id,name\n1,urzad\n"),
        storage,
        store,
      }),
    ).rejects.toThrow("R2 is unavailable");

    const overview = await getOperationsOverview({ store });
    const stagingRun = overview.runs.find((run) => run.operationKey === "kpp-source-staging");

    expect(overview.summary).toMatchObject({
      totalRuns: 2,
      successfulRuns: 1,
      failedRuns: 1,
    });
    expect(stagingRun).toMatchObject({
      operationKey: "kpp-source-staging",
      status: "failed",
      staging: {
        status: "failed",
        r2Key: expect.stringMatching(/^tmp\/kpp\/2150707\/[0-9a-f-]{36}\.csv$/),
        byteSize: null,
        checksumSha256: null,
        retention: {
          status: "temporary",
        },
      },
      error: {
        code: "KPP_STAGING_FAILED",
        message: "R2 is unavailable",
        retryable: true,
      },
    });
  });

  it("computes the KPP source checksum without buffering the full response body", async () => {
    const store = createInMemoryOperationsRunStore();
    const sourceChunks = [
      new TextEncoder().encode("id,name\n"),
      new TextEncoder().encode("1,urzad\n"),
    ];
    const uploadedChunks: Uint8Array[] = [];
    const storage: TemporaryKppSourceStorage = {
      async putTemporaryObject({ body }) {
        const reader = body.getReader();

        async function readNextChunk(): Promise<void> {
          const chunk = await reader.read();

          if (chunk.done) {
            return;
          }

          uploadedChunks.push(chunk.value);

          return readNextChunk();
        }

        await readNextChunk();
      },
    };

    await discoverLatestKppSource({
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
                download_url: "https://example.test/kpp.csv",
                csv_download_url: null,
                file_url: "https://example.test/kpp.csv",
                csv_file_url: null,
              },
            },
          ],
          links: {},
        }),
      store,
    });

    const arrayBufferSpy = vi
      .spyOn(Response.prototype, "arrayBuffer")
      .mockRejectedValue(new Error("arrayBuffer should not be used for staging checksums"));

    try {
      await stageLatestKppSource({
        fetch: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                for (const chunk of sourceChunks) {
                  controller.enqueue(chunk);
                }

                controller.close();
              },
            }),
          ),
        storage,
        store,
      });
    } finally {
      arrayBufferSpy.mockRestore();
    }

    const overview = await getOperationsOverview({ store });
    const stagingRun = overview.runs.find((run) => run.operationKey === "kpp-source-staging");

    expect(new TextDecoder().decode(Buffer.concat(uploadedChunks))).toBe("id,name\n1,urzad\n");
    expect(stagingRun).toMatchObject({
      status: "completed",
      staging: {
        byteSize: 16,
        checksumSha256: "adfb7dc69d27b66f7d1bfc9679af62da34085af9c8113b7c990355dc74b2b807",
      },
    });
  });

  it("discovers the latest supported KPP resource and tracks it as a run", async () => {
    const store = createInMemoryOperationsRunStore();

    await discoverLatestKppSource({
      fetch: async (input) => {
        expect(String(input)).toBe(kppResourcesUrl);

        return Response.json({
          data: [
            {
              id: "1730451",
              attributes: {
                title:
                  "Dane o podmiotach świadczących usługi publiczne z Katalogu Podmiotów Publicznych kwiecień 2026 r.",
                format: "txt",
                data_date: "2026-04-28",
                download_url:
                  "https://api.dane.gov.pl/resources/1730451,dane-o-podmiotach-swiadczacych-usugi-publiczne-z-katalogu-podmiotow-publicznych-kwiecien-2026-r/file",
                csv_download_url: null,
                file_url: "https://api.dane.gov.pl/media/resources/20260428/export_gov.csv",
                csv_file_url: null,
              },
            },
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
          links: {
            self: kppResourcesUrl,
          },
        });
      },
      store,
    });

    const overview = await getOperationsOverview({ store });

    expect(overview.summary).toEqual({
      totalRuns: 1,
      activeRuns: 0,
      successfulRuns: 1,
      failedRuns: 0,
      lastCompletedAt: expect.any(String),
    });
    expect(overview.runs).toHaveLength(1);
    expect(overview.runs[0]).toMatchObject({
      kind: "import",
      operationKey: "kpp-source-discovery",
      sourceLabel:
        "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych - czerwiec 2026",
      sourceUrl:
        "https://api.dane.gov.pl/resources/2150707,dane-podmiotow-swiadczacych-usugi-publiczne-z-katalogu-podmiotow-publicznych-czerwiec-2026/file",
      status: "completed",
      source: {
        datasetId: "3520",
        datasetTitle:
          "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych",
        resourceId: "2150707",
        resourceTitle:
          "Dane podmiotów świadczących usługi publiczne z Katalogu Podmiotów Publicznych - czerwiec 2026",
        resourceDataDate: "2026-06-26",
        resourceDownloadUrl:
          "https://api.dane.gov.pl/resources/2150707,dane-podmiotow-swiadczacych-usugi-publiczne-z-katalogu-podmiotow-publicznych-czerwiec-2026/file",
        resourceFormat: "csv",
      },
    });
  });

  it("fails discovery when the KPP dataset does not expose any resources", async () => {
    const store = createInMemoryOperationsRunStore();

    await expect(
      discoverLatestKppSource({
        fetch: async () =>
          Response.json({
            data: [],
            links: {},
          }),
        store,
      }),
    ).rejects.toThrow("KPP dataset does not expose any resources");
  });

  it("fails discovery when the latest KPP resources do not expose a CSV download", async () => {
    const store = createInMemoryOperationsRunStore();

    await expect(
      discoverLatestKppSource({
        fetch: async () =>
          Response.json({
            data: [
              {
                id: "1083713",
                attributes: {
                  title:
                    "Dane o podmiotach świadczących usługi publiczne z Katalogu Podmiotów Publicznych styczeń 2026 r.",
                  format: "xlsx",
                  data_date: "2026-01-16",
                  download_url:
                    "https://api.dane.gov.pl/resources/1083713,dane-o-podmiotach-swiadczacych-usugi-publiczne-z-katalogu-podmiotow-publicznych-styczen-2026-r/file",
                  csv_download_url: null,
                  file_url: "https://api.dane.gov.pl/media/resources/20260116/export_gov.xlsx",
                  csv_file_url: null,
                },
              },
            ],
            links: {},
          }),
        store,
      }),
    ).rejects.toThrow("KPP dataset does not expose a supported CSV resource");
  });
});
