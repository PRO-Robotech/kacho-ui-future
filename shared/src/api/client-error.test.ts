import { api, ApiError } from "./client";

describe("api client preserves non-JSON error bodies", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function mockFetch(status: number, statusText: string, body: string) {
    // jsdom has no global Response; a minimal Response-like object is enough
    // for fetchJson (it only calls res.ok / status / statusText / text()).
    globalThis.fetch = (() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        statusText,
        text: () => Promise.resolve(body),
      })) as unknown as typeof fetch;
  }

  it("surfaces a plaintext gateway 5xx body instead of swallowing it", async () => {
    mockFetch(502, "Bad Gateway", "upstream connect error or disconnect/reset before headers");
    await expect(api.get("/vpc/v1/networks/x")).rejects.toMatchObject({
      status: 502,
      details: "upstream connect error or disconnect/reset before headers",
    });
  });

  it("unwraps a JSON error envelope as before", async () => {
    mockFetch(404, "Not Found", JSON.stringify({ code: "NOT_FOUND", message: "Network x not found" }));
    const err = (await api.get("/vpc/v1/networks/x").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Network x not found");
  });
});
