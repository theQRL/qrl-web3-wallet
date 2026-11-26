import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkWalletAddQrlChainParams } from "./restrictedMethodsMiddlewareUtils";

vi.mock("@/utilities/storageUtil", () => ({
  __esModule: true,
  default: {
    getAllBlockChains: vi.fn(async () => []),
  },
}));

const validRequest = {
  chainName: "Example",
  chainId: "0x1234",
  nativeCurrency: { name: "Quanta", symbol: "QRL", decimals: 18 },
  rpcUrls: ["https://rpc.example/rpc"],
  blockExplorerUrls: ["https://explorer.example"],
  iconUrls: ["data:image/png;base64,AAAA"],
};

const check = (overrides: Record<string, unknown>) =>
  checkWalletAddQrlChainParams({ ...validRequest, ...overrides } as never);

describe("wallet_addQRLChain optional fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a complete request", async () => {
    expect((await check({})).canProceed).toBe(true);
  });

  it.each(["ftp://localhost/rpc", "ws://127.0.0.1/rpc", "http://rpc.example/rpc"])(
    "rejects an RPC URL outside the allowed HTTP(S) policy: %s",
    async (url) => {
      const result = await check({ rpcUrls: [url] });
      expect(result.canProceed).toBe(false);
      expect(result.proceedError?.code).toBe(-32602);
    },
  );

  it.each(["http://localhost:8545/rpc", "https://127.0.0.1/rpc"])(
    "accepts a loopback HTTP(S) endpoint: %s",
    async (url) => {
      expect((await check({ rpcUrls: [url] })).canProceed).toBe(true);
    },
  );

  it("accepts a request without the optional lists", async () => {
    const { canProceed } = await checkWalletAddQrlChainParams({
      chainName: "Example",
      chainId: "0x1234",
      nativeCurrency: null,
      rpcUrls: ["https://rpc.example/rpc"],
    } as never);
    expect(canProceed).toBe(true);
  });

  it.each([
    ["blockExplorerUrls", "https://explorer.example"],
    ["blockExplorerUrls", [1]],
    ["blockExplorerUrls", null],
    ["iconUrls", "data:image/png;base64,AAAA"],
    ["iconUrls", [{ url: "x" }]],
  ])("refuses %s of %j", async (key, value) => {
    const result = await check({ [key]: value });
    expect(result.canProceed).toBe(false);
    expect(result.proceedError?.code).toBe(-32602);
  });

  it.each([[{ first: "Quanta" }], [7], [["Quanta"]]])(
    "refuses a nativeCurrency name of %j",
    async (name) => {
      const result = await check({
        nativeCurrency: { name, symbol: "QRL", decimals: 18 },
      });
      expect(result.canProceed).toBe(false);
      expect(result.proceedError?.code).toBe(-32602);
    },
  );
});
