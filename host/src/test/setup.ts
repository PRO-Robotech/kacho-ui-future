import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "node:util";

Object.defineProperty(global, "TextEncoder", {
  writable: true,
  value: TextEncoder,
});

Object.defineProperty(global, "TextDecoder", {
  writable: true,
  value: TextDecoder,
});

Object.defineProperty(global, "fetch", {
  writable: true,
  value: () => Promise.reject(new Error("fetch mock not implemented")),
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

class ResizeObserverMock {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});
