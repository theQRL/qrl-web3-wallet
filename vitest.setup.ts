import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockImplementation((query) => ({
      matches: true,
      query,
    })),
  });

  Object.defineProperty(window, "scrollTo", {
    value: vi.fn().mockImplementation((x, y) => ({ x, y })),
  });
}
