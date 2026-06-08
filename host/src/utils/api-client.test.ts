import { jest } from "@jest/globals";
import { apiGet } from "./api-client";

const jsonResponse = (body: unknown) => {
  return Promise.resolve({
    ok: true,
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText: "OK",
  } as Response);
};

describe("api-client", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("includes browser credentials on API requests", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => jsonResponse({ ok: true }));

    await apiGet("/iam/v1/accounts");

    const fetchMock = jest.mocked(global.fetch);
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];

    expect(init.credentials).toBe("include");
  });
});
