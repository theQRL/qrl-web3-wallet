import { describe, expect, it, vi } from "vitest";
import { withMiddlewareErrorBoundary } from "./middlewareErrorBoundary";

const makeCall = () => {
  const res: Record<string, unknown> = {};
  return { res, next: vi.fn(), end: vi.fn() };
};

const req = { id: 1, jsonrpc: "2.0" as const, method: "qrl_chainId" } as never;

describe("withMiddlewareErrorBoundary", () => {
  it("passes a successful middleware through untouched", async () => {
    const { res, next, end } = makeCall();
    const inner = vi.fn(async (_r, response: Record<string, unknown>, _n, e) => {
      response.result = "0x1";
      return e();
    });

    withMiddlewareErrorBoundary(inner as never, "inner")(
      req,
      res as never,
      next as never,
      end as never,
    );

    await vi.waitFor(() => {
      expect(end).toHaveBeenCalledOnce();
    });
    expect(res.result).toBe("0x1");
    expect(res.error).toBeUndefined();
    expect(end).toHaveBeenCalled();
  });

  it("lets a middleware defer to the next one", async () => {
    const { res, next, end } = makeCall();
    const inner = vi.fn(async (_r, _res, n) => n());

    withMiddlewareErrorBoundary(inner as never, "inner")(
      req,
      res as never,
      next as never,
      end as never,
    );

    await vi.waitFor(() => {
      expect(next).toHaveBeenCalledOnce();
    });
    expect(res.error).toBeUndefined();
  });

  // CIPH-QRLW326-30. The vendored engine's try/catch is synchronous, so an async
  // rejection escaped it: the caller's promise never settled and the service
  // worker logged an unhandled rejection.
  it("settles the request when an async middleware rejects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res, next, end } = makeCall();
    const inner = vi.fn(async () => {
      throw new Error("destructure of undefined");
    });

    withMiddlewareErrorBoundary(inner as never, "inner")(
      req,
      res as never,
      next as never,
      end as never,
    );

    await vi.waitFor(() => {
      expect(end).toHaveBeenCalledOnce();
    });
    expect(res.error).toBeDefined();
    expect(end).toHaveBeenCalledOnce();
    // The caller must not be left waiting, and the failure must be observable.
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("does not leak the internal failure detail to the dApp", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res, next, end } = makeCall();
    const inner = vi.fn(async () => {
      throw new Error("KEYSTORES read failed at /Users/secret/path");
    });

    withMiddlewareErrorBoundary(inner as never, "inner")(
      req,
      res as never,
      next as never,
      end as never,
    );

    await vi.waitFor(() => {
      expect(end).toHaveBeenCalledOnce();
    });
    expect((res.error as Error).message).toBe(
      "The wallet could not process the request.",
    );
    expect(JSON.stringify(res.error)).not.toMatch(/secret/);
    errorLog.mockRestore();
  });

  it("settles a synchronous throw too", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res, next, end } = makeCall();
    const inner = vi.fn(() => {
      throw new Error("sync boom");
    });

    withMiddlewareErrorBoundary(inner as never, "inner")(
      req,
      res as never,
      next as never,
      end as never,
    );

    await vi.waitFor(() => {
      expect(end).toHaveBeenCalledOnce();
    });
    expect(res.error).toBeDefined();
    errorLog.mockRestore();
  });

  it("discards a result written before the throw", async () => {
    // A response carrying both `result` and `error` violates JSON-RPC 2.0, and a
    // client that reads `result` first would treat the failed request as having
    // succeeded — the opposite of failing closed.
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res, next, end } = makeCall();
    const inner = vi.fn(async (_req: unknown, response: { result?: unknown }) => {
      response.result = ["Qdeadbeef"];
      throw new Error("boom after writing a result");
    });

    withMiddlewareErrorBoundary(inner as never, "inner")(
      req,
      res as never,
      next as never,
      end as never,
    );

    await vi.waitFor(() => {
      expect(end).toHaveBeenCalledOnce();
    });
    expect(res.error).toBeDefined();
    expect("result" in res).toBe(false);
    errorLog.mockRestore();
  });
});
