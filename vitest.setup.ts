import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

(globalThis as Record<string, any>).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  value: vi.fn().mockImplementation((query) => ({
    matches: true,
    query,
  })),
});

Object.defineProperty(window, "scrollTo", {
  value: vi.fn().mockImplementation((x, y) => ({ x, y })),
});
