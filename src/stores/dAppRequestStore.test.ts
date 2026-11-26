import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DAppRequestType } from "@/scripts/middlewares/middlewareTypes";

// ── Mocks (hoisting-safe) ──────────────────────────────────────────
const sessionStore: Record<string, any> = {};
const storageListeners: Array<
  (changes: Record<string, unknown>, areaName: string) => void
> = [];

const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(() => Promise.resolve({} as any)),
}));

vi.mock("webextension-polyfill", () => ({
  __esModule: true,
  default: {
    storage: {
      local: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
      },
      session: {
        get: vi.fn(() => Promise.resolve({})),
        set: vi.fn(() => Promise.resolve()),
      },
      onChanged: {
        addListener: vi.fn((fn) => {
          storageListeners.push(fn);
        }),
        removeListener: vi.fn(),
      },
    },
    runtime: { sendMessage: mockSendMessage },
    tabs: {
      query: vi.fn(() =>
        Promise.resolve([
          { url: "https://dex.example", title: "Dex", favIconUrl: "" },
        ]),
      ),
    },
  },
}));

let storedRequest: DAppRequestType | undefined;

/** Per-origin grants, keyed by origin, as `storageUtil` stores them. */
const grantsByOrigin: Record<
  string,
  { accounts: string[]; blockchains: unknown[] }
> = {};

vi.mock("@/utilities/storageUtil", () => ({
  __esModule: true,
  default: {
    getDAppsRequestData: vi.fn(() => Promise.resolve(storedRequest)),
    getDAppsConnectedAccountsData: vi.fn((origin: string) =>
      Promise.resolve(grantsByOrigin[origin]),
    ),
    clearDAppsConnectedAccountsData: vi.fn(() => Promise.resolve()),
  },
}));

import DAppRequestStore from "./dAppRequestStore";

const TRANSACTION_REQUEST: DAppRequestType = {
  method: "qrl_sendTransaction",
  params: [{ from: "Qaaa", to: "Qbbb", value: "0x1" }],
  requestId: "request-A-transaction",
  authorizedChainId: "0x1",
  requestData: { senderData: { url: "https://dex.mallory.example" } } as never,
};

const CONNECT_REQUEST: DAppRequestType = {
  method: "qrl_requestAccounts",
  requestId: "request-B-connect",
  authorizedChainId: "0x1",
  requestData: { senderData: { url: "https://dex.mallory.example" } } as never,
};

/** Mimic the middleware replacing the single pending-request slot. */
const setPendingRequest = async (
  store: DAppRequestStore,
  request: DAppRequestType | undefined,
) => {
  storedRequest = request;
  for (const listener of storageListeners) {
    listener({ DAPPS: { newValue: request } }, "session");
  }
  await store.readDAppRequestData();
};

describe("DAppRequestStore — permission prompts seed from the requesting origin", () => {
  let store: DAppRequestStore;

  beforeEach(async () => {
    storageListeners.length = 0;
    storedRequest = undefined;
    for (const k of Object.keys(grantsByOrigin)) delete grantsByOrigin[k];
    store = new DAppRequestStore();
    await Promise.resolve();
  });

  it("derives the requesting origin from the service-worker-stamped senderData", async () => {
    await setPendingRequest(store, {
      ...CONNECT_REQUEST,
      requestData: {
        senderData: { url: "https://ads.mallory.example/frame.html" },
      } as never,
    });

    expect(store.requestingOrigin).toBe("https://ads.mallory.example");
  });

  it("returns an empty selection for an origin that has never connected", async () => {
    // CIPH-QRLW326-6. The victim dApp is connected and would be the active tab;
    // the requester is a different origin and must start from nothing, so the user
    // has to make an explicit choice instead of confirming a pre-ticked one.
    grantsByOrigin["https://dex.example"] = {
      accounts: ["Qvictim"],
      blockchains: [{ chainId: "0x1" }],
    };
    await setPendingRequest(store, {
      ...CONNECT_REQUEST,
      requestData: {
        senderData: { url: "https://ads.mallory.example/frame.html" },
      } as never,
    });

    await expect(store.getRequestingOriginGrants()).resolves.toEqual({
      accounts: [],
      blockchains: [],
    });
  });

  it("returns the requesting origin's own grants when it is already connected", async () => {
    grantsByOrigin["https://dex.example"] = {
      accounts: ["Qalice"],
      blockchains: [{ chainId: "0x1" }],
    };
    await setPendingRequest(store, {
      ...CONNECT_REQUEST,
      requestData: { senderData: { url: "https://dex.example/app" } } as never,
    });

    await expect(store.getRequestingOriginGrants()).resolves.toEqual({
      accounts: ["Qalice"],
      blockchains: [{ chainId: "0x1" }],
    });
  });

  it("yields an empty selection when the sender url is missing or unparseable", async () => {
    await setPendingRequest(store, {
      ...CONNECT_REQUEST,
      requestData: { senderData: { url: "not a url" } } as never,
    });

    expect(store.requestingOrigin).toBe("");
    await expect(store.getRequestingOriginGrants()).resolves.toEqual({
      accounts: [],
      blockchains: [],
    });
  });

  it.each([
    ["file:///Users/victim/evil.html", "a local file"],
    ["data:text/html,<script>1</script>", "a data url"],
  ])("treats an opaque origin (%s) as unidentifiable", async (url) => {
    // `new URL(url).origin` serialises an opaque origin to the literal string
    // "null", which is a perfectly usable storage key — so a getter deriving its
    // own origin would read grants from a bucket shared by every unrelated
    // opaque context. The middleware side was hardened for this; the read path
    // must agree. See CIPH-QRLW326-31 and -39.
    grantsByOrigin["null"] = {
      accounts: ["Qalice"],
      blockchains: [{ chainId: "0x1" }],
    };
    await setPendingRequest(store, {
      ...CONNECT_REQUEST,
      requestData: { senderData: { url } } as never,
    });

    expect(store.requestingOrigin).toBe("");
    await expect(store.getRequestingOriginGrants()).resolves.toEqual({
      accounts: [],
      blockchains: [],
    });
  });
});

describe("DAppRequestStore — approval handler binding", () => {
  let store: DAppRequestStore;

  beforeEach(async () => {
    mockSendMessage.mockClear();
    storageListeners.length = 0;
    storedRequest = undefined;
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
    store = new DAppRequestStore();
    await Promise.resolve();
  });

  it("runs the handler when it was registered for the request on screen", async () => {
    await setPendingRequest(store, TRANSACTION_REQUEST);
    const effect = vi.fn(async () => undefined);
    store.setOnPermissionCallBack(effect);

    await store.onPermission(true);

    expect(effect).toHaveBeenCalledWith(true);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        hasApproved: true,
        requestId: "request-A-transaction",
      }),
    );
  });

  it("uses the original method and leaves a replacement request intact", async () => {
    await setPendingRequest(store, TRANSACTION_REQUEST);
    store.setOnPermissionCallBack(async () => {
      await setPendingRequest(store, CONNECT_REQUEST);
    });

    await store.onPermission(true);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        method: TRANSACTION_REQUEST.method,
        requestId: TRANSACTION_REQUEST.requestId,
        hasApproved: false,
      }),
    );
    expect(storedRequest).toEqual(CONNECT_REQUEST);
    expect(store.approvalProcessingStatus.hasCompleted).toBe(false);
  });

  it("does not run a handler registered for a request that has since been replaced", async () => {
    // CIPH-QRLW326-1. Mallory queues a transaction, lets it lapse, then raises a
    // benign connect prompt; the user's single click must not sign the earlier
    // transaction.
    await setPendingRequest(store, TRANSACTION_REQUEST);
    const signAndBroadcast = vi.fn(async () => undefined);
    store.setOnPermissionCallBack(signAndBroadcast);

    await setPendingRequest(store, CONNECT_REQUEST);
    await store.onPermission(true);

    expect(signAndBroadcast).not.toHaveBeenCalled();
    // Fails closed: the dApp is told the request was rejected, not approved.
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        hasApproved: false,
        requestId: "request-B-connect",
      }),
    );
  });

  it("blocks a stale handler on the requestId binding alone, without the storage listener", async () => {
    // `subscribeToRequestStorage` is wrapped in try/catch because
    // `storage.onChanged` is unavailable in popup-only contexts, so in those the
    // listener never clears the handler and the binding is the only defence.
    // Simulate that by replacing the request without firing any listener.
    await setPendingRequest(store, TRANSACTION_REQUEST);
    const signAndBroadcast = vi.fn(async () => undefined);
    store.setOnPermissionCallBack(signAndBroadcast);
    expect(store.onPermissionCallBackRequestId).toBe("request-A-transaction");

    storedRequest = CONNECT_REQUEST;
    await store.readDAppRequestData();
    // The handler is still installed — only the binding stands between the
    // user's click and the earlier transaction.
    expect(store.onPermissionCallBackRequestId).toBe("request-A-transaction");

    await store.onPermission(true);

    expect(signAndBroadcast).not.toHaveBeenCalled();
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        hasApproved: false,
        requestId: "request-B-connect",
      }),
    );
  });

  it("clears the handler as soon as the pending request changes", async () => {
    await setPendingRequest(store, TRANSACTION_REQUEST);
    store.setOnPermissionCallBack(vi.fn(async () => undefined));
    expect(store.onPermissionCallBackRequestId).toBe("request-A-transaction");

    await setPendingRequest(store, CONNECT_REQUEST);

    expect(store.onPermissionCallBackRequestId).toBeUndefined();
  });

  it("refuses to approve when no handler has been registered at all", async () => {
    await setPendingRequest(store, CONNECT_REQUEST);

    await store.onPermission(true);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ hasApproved: false }),
    );
  });

  it("still reports a rejection when the user declines", async () => {
    await setPendingRequest(store, TRANSACTION_REQUEST);
    const effect = vi.fn(async () => undefined);
    store.setOnPermissionCallBack(effect);

    await store.onPermission(false);

    expect(effect).toHaveBeenCalledWith(false);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ hasApproved: false }),
    );
  });

  it("re-binds correctly when a new request installs its own handler", async () => {
    await setPendingRequest(store, TRANSACTION_REQUEST);
    const stale = vi.fn(async () => undefined);
    store.setOnPermissionCallBack(stale);

    await setPendingRequest(store, CONNECT_REQUEST);
    const fresh = vi.fn(async () => undefined);
    store.setOnPermissionCallBack(fresh);

    await store.onPermission(true);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledWith(true);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ hasApproved: true }),
    );
  });
});
