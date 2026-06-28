import { describe, expect, it } from "vitest";

import {
  createInMemoryOperationsRunStore,
  discoverLatestKppSource,
  getOperationsOverview,
} from "./service";

const kppResourcesUrl =
  "https://api.dane.gov.pl/datasets/3520,dane-podmiotow-swiadczacych-usugi-publiczne-z-kat/resources?page=1";

describe("operations service", () => {
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
