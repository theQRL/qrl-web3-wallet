import { JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import { describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";
import { appendSenderDataMiddleware } from "./appendSenderDataMiddleware";

const buildReq = (): JsonRpcRequest => ({
  id: 1,
  jsonrpc: "2.0",
  method: "qrl_requestAccounts",
  params: [],
});

const buildSender = (
  overrides: Partial<browser.Runtime.MessageSender> = {},
): browser.Runtime.MessageSender => ({
  url: "https://attacker.example/iframe.html",
  tab: {
    id: 42,
    index: 0,
    highlighted: false,
    active: true,
    pinned: false,
    incognito: false,
    title: "Trusted DApp",
    url: "https://trusted.example/app",
    favIconUrl: "https://trusted.example/favicon.ico",
  } as browser.Tabs.Tab,
  ...overrides,
});

describe("appendSenderDataMiddleware", () => {
  it("attributes the request to the frame URL, not the top-level tab URL", () => {
    const req = buildReq();
    const next = vi.fn();
    const sender = buildSender();

    appendSenderDataMiddleware({ sender })(req as never, {} as never, next, () => {});

    expect(req.senderData?.url).toBe("https://attacker.example/iframe.html");
    expect(req.senderData?.url).not.toBe(sender.tab?.url);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("still forwards tab metadata (id, title, favicon) for UI context", () => {
    const req = buildReq();
    const sender = buildSender();

    appendSenderDataMiddleware({ sender })(req as never, {} as never, () => {}, () => {});

    expect(req.senderData?.tabId).toBe(42);
    expect(req.senderData?.title).toBe("Trusted DApp");
    expect(req.senderData?.favIconUrl).toBe("https://trusted.example/favicon.ico");
  });

  it("leaves url undefined when the sender has no frame URL (fail closed)", () => {
    const req = buildReq();
    const sender = buildSender({ url: undefined });

    appendSenderDataMiddleware({ sender })(req as never, {} as never, () => {}, () => {});

    // Downstream consumers read senderData.url through `new URL(... ?? "").origin`,
    // which throws for an empty/undefined URL and fails the request closed.
    expect(req.senderData?.url).toBeUndefined();
  });

  it("uses the top-level frame URL when the request originates from the top frame", () => {
    const req = buildReq();
    const sender = buildSender({
      url: "https://trusted.example/app",
    });

    appendSenderDataMiddleware({ sender })(req as never, {} as never, () => {}, () => {});

    expect(req.senderData?.url).toBe("https://trusted.example/app");
  });
});
