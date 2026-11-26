import { JsonRpcEngine } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import { JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import { describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";
import { appendSenderDataMiddleware } from "./appendSenderDataMiddleware";
import { unrestrictedMethodsMiddleware } from "./unrestrictedMethodsMiddleware";

const buildReq = (): JsonRpcRequest => ({
  id: 1,
  jsonrpc: "2.0",
  method: "qrl_requestAccounts",
  params: [],
});

type Sender = Parameters<typeof appendSenderDataMiddleware>[0]["sender"];

const buildSender = (overrides: Partial<Sender> = {}): Sender => ({
  origin: "https://attacker.example",
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

  it.each([
    { url: undefined },
    { origin: undefined },
    { origin: "null" },
    { origin: "https://other.example" },
  ])("rejects an unverified sender before downstream middleware (%j)", (overrides) => {
    const req = buildReq();
    const res = { id: req.id, jsonrpc: req.jsonrpc };
    const next = vi.fn();
    const end = vi.fn();

    appendSenderDataMiddleware({ sender: buildSender(overrides) })(req as never, res, next, end);

    expect(res).toMatchObject({ error: { code: 4100 } });
    expect(req.senderData).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledOnce();
  });

  it("uses the top-level frame URL when the request originates from the top frame", () => {
    const req = buildReq();
    const sender = buildSender({
      url: "https://trusted.example/app",
      origin: "https://trusted.example",
    });

    appendSenderDataMiddleware({ sender })(req as never, {} as never, () => {}, () => {});

    expect(req.senderData?.url).toBe("https://trusted.example/app");
  });

  it("routes an unrestricted request only to its originating frame", async () => {
    vi.mocked(browser.tabs.sendMessage).mockResolvedValueOnce("0x1");
    const engine = new JsonRpcEngine();
    engine.push(appendSenderDataMiddleware({ sender: buildSender({ frameId: 7 }) }));
    engine.push(unrestrictedMethodsMiddleware);

    const request = { ...buildReq(), method: "qrl_chainId" };
    expect(await engine.handle(request)).toMatchObject({ result: "0x1" });
    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ data: expect.objectContaining(request) }),
      { frameId: 7 },
    );
  });
});
