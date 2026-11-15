import { afterEach, describe, expect, it, vi } from "vitest";
import {
  kdfWorkerCount,
  runWorkerJob,
  splitIntoChunks,
} from "./keystoreWorkerPool";

describe("splitIntoChunks", () => {
  it("splits contiguously and preserves order on concatenation", () => {
    const items = [1, 2, 3, 4, 5];
    const chunks = splitIntoChunks(items, 3);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks.flat()).toEqual(items);
  });

  it("never produces empty chunks when chunkCount exceeds item count", () => {
    expect(splitIntoChunks([1, 2], 5)).toEqual([[1], [2]]);
  });

  it("returns a single chunk for chunkCount 1", () => {
    expect(splitIntoChunks([1, 2, 3], 1)).toEqual([[1, 2, 3]]);
  });

  it("returns no chunks for an empty list", () => {
    expect(splitIntoChunks([], 3)).toEqual([]);
  });
});

describe("kdfWorkerCount", () => {
  const setCores = (cores: number | undefined) => {
    Object.defineProperty(navigator, "hardwareConcurrency", {
      value: cores,
      configurable: true,
    });
  };

  afterEach(() => setCores(undefined));

  it("caps at the memory ceiling regardless of cores", () => {
    setCores(16);
    expect(kdfWorkerCount(10)).toBe(3);
  });

  it("never exceeds the item count", () => {
    setCores(8);
    expect(kdfWorkerCount(1)).toBe(1);
    expect(kdfWorkerCount(2)).toBe(2);
  });

  it("caps at the core count on small machines", () => {
    setCores(2);
    expect(kdfWorkerCount(10)).toBe(2);
  });

  it("returns at least one worker when core detection is unavailable", () => {
    setCores(undefined);
    expect(kdfWorkerCount(5)).toBe(2);
    expect(kdfWorkerCount(0)).toBe(1);
  });
});

describe("runWorkerJob", () => {
  type Req = { input: string };
  type Res = { success: boolean; echo?: string };

  class FakeWorker {
    onmessage: ((event: MessageEvent<Res>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    terminated = false;
    constructor(private readonly behavior: "reply" | "error") {}
    postMessage(request: Req) {
      queueMicrotask(() => {
        if (this.behavior === "reply") {
          this.onmessage?.({
            data: { success: true, echo: request.input },
          } as MessageEvent<Res>);
        } else {
          this.onerror?.(new Event("error") as ErrorEvent);
        }
      });
    }
    terminate() {
      this.terminated = true;
    }
  }

  it("resolves with the worker response and terminates the worker", async () => {
    const worker = new FakeWorker("reply");
    const result = await runWorkerJob<Req, Res>(
      () => worker as unknown as Worker,
      { input: "hello" },
      { success: false },
    );
    expect(result).toEqual({ success: true, echo: "hello" });
    expect(worker.terminated).toBe(true);
  });

  it("resolves with the failure value on worker error", async () => {
    const worker = new FakeWorker("error");
    const result = await runWorkerJob<Req, Res>(
      () => worker as unknown as Worker,
      { input: "boom" },
      { success: false },
    );
    expect(result).toEqual({ success: false });
    expect(worker.terminated).toBe(true);
  });

  it("spawns a fresh worker per job", async () => {
    const factory = vi.fn(() => new FakeWorker("reply") as unknown as Worker);
    await runWorkerJob<Req, Res>(factory, { input: "a" }, { success: false });
    await runWorkerJob<Req, Res>(factory, { input: "b" }, { success: false });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
