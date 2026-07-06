import { safeInternalPath } from "./redirect";

// jsdom serves window.location.origin as http://localhost.

describe("safeInternalPath", () => {
  it("passes through a same-origin relative path", () => {
    expect(safeInternalPath("/vpc/networks")).toBe("/vpc/networks");
  });

  it("preserves query string and hash of a relative path", () => {
    expect(safeInternalPath("/iam/users?flow=1#tab")).toBe("/iam/users?flow=1#tab");
  });

  it("collapses a same-origin absolute URL to its path", () => {
    expect(safeInternalPath("http://localhost/compute/instances")).toBe("/compute/instances");
  });

  it("falls back for a cross-origin absolute URL", () => {
    expect(safeInternalPath("https://evil.example/steal")).toBe("/");
  });

  it("falls back for a protocol-relative target", () => {
    expect(safeInternalPath("//evil.example")).toBe("/");
  });

  it("falls back for a backslash-obfuscated protocol-relative target", () => {
    expect(safeInternalPath("/\\evil.example")).toBe("/");
  });

  it("falls back for a javascript: scheme", () => {
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });

  it("falls back for null / empty input", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath(undefined)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
  });

  it("honours a custom fallback", () => {
    expect(safeInternalPath("https://evil.example", "/home")).toBe("/home");
  });

  it("falls back for a leading-whitespace absolute URL (parser trims the space)", () => {
    expect(safeInternalPath(" https://evil.example")).toBe("/");
  });

  it("keeps a bare token as a same-origin in-app path (not a cross-origin hop)", () => {
    // "evil.example" resolves against our own origin, so it is an in-app path,
    // never a cross-origin redirect — returning it is safe.
    expect(safeInternalPath("evil.example")).toBe("/evil.example");
  });
});
