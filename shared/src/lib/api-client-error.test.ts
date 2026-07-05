import { apiErrorFromBody, ApiError } from "./api-client";

describe("apiErrorFromBody preserves backend detail", () => {
  it("uses code/message/details from a JSON error envelope", () => {
    const e = apiErrorFromBody(
      409,
      "Conflict",
      JSON.stringify({ code: "ALREADY_EXISTS", message: "network exists", details: [{ x: 1 }] }),
    );
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe("ALREADY_EXISTS");
    expect(e.message).toBe("network exists");
    expect(e.details).toEqual([{ x: 1 }]);
  });

  it("does NOT discard a non-JSON error body (regression: bare catch swallowed it)", () => {
    // A gateway/nginx 5xx often returns an HTML or plaintext body, not JSON.
    const body = "upstream connect error or disconnect/reset before headers";
    const e = apiErrorFromBody(502, "Bad Gateway", body);
    // Previously the JSON.parse failure was swallowed and only res.statusText
    // survived; the real backend detail must now reach the caller.
    expect(e.message).toContain("upstream connect error");
    expect(e.details).toBe(body);
    expect(e.status).toBe(502);
  });

  it("falls back to statusText when the body is empty", () => {
    const e = apiErrorFromBody(500, "Internal Server Error", "");
    expect(e.message).toBe("Internal Server Error");
    expect(e.code).toBe("500");
  });

  it("truncates a very large non-JSON body to bound memory", () => {
    const e = apiErrorFromBody(500, "Internal Server Error", "x".repeat(10_000));
    expect(typeof e.details).toBe("string");
    expect((e.details as string).length).toBeLessThanOrEqual(2048);
  });
});
