import { beforeEach, describe, expect, it, vi } from "vitest";
import StorageUtil from "@/utilities/storageUtil";
import { RESTRICTED_METHODS } from "../constants/requestConstants";
import {
  checkAccountAndChainHaveBeenAuthorized,
  normalizeChainId,
  revalidateAuthorizedDAppRequest,
} from "./restrictedMethodsMiddlewareUtils";

const ACCOUNT = "Q20B714091cF2a62DADda2847803e3f1B9D2D3779";
const ORIGIN = "https://audit-dapp.example";

const request = (method: string, params: unknown[]) =>
  ({
    id: 1,
    jsonrpc: "2.0",
    method,
    params,
    senderData: { url: `${ORIGIN}/request` },
  }) as never;

describe("dApp chain authorization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(StorageUtil, "getDAppsConnectedAccountsData").mockResolvedValue({
      urlOrigin: ORIGIN,
      accounts: [ACCOUNT],
      blockchains: [{ chainId: "0x539" } as never],
      permissions: [],
    });
    vi.spyOn(StorageUtil, "getActiveBlockChain").mockResolvedValue({
      chainId: "0x539",
    } as never);
  });

  it("canonicalizes supported decimal and hexadecimal chain IDs", () => {
    expect(normalizeChainId(1337)).toBe("0x539");
    expect(normalizeChainId("1337")).toBe("0x539");
    expect(normalizeChainId("0X0539")).toBe("0x539");
    expect(normalizeChainId("1.5")).toBeUndefined();
    expect(normalizeChainId(-1)).toBeUndefined();
  });

  it("allows an authorized transaction on the active chain", async () => {
    const result = await checkAccountAndChainHaveBeenAuthorized(
      request(RESTRICTED_METHODS.QRL_SEND_TRANSACTION, [{ from: ACCOUNT }]),
    );

    expect(result.canProceed).toBe(true);
    expect(result).toMatchObject({ authorizedChainId: "0x539" });
  });

  it("rejects before approval when the active chain was not granted", async () => {
    vi.mocked(StorageUtil.getActiveBlockChain).mockResolvedValue({
      chainId: "0x1",
    } as never);

    const result = await checkAccountAndChainHaveBeenAuthorized(
      request(RESTRICTED_METHODS.QRL_SEND_TRANSACTION, [{ from: ACCOUNT }]),
    );

    expect(result.canProceed).toBe(false);
    expect(result.proceedError?.message).toContain("not authorized");
  });

  it("rejects typed data whose declared chain differs from the active chain", async () => {
    const result = await checkAccountAndChainHaveBeenAuthorized(
      request(RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4, [
        ACCOUNT,
        { domain: { chainId: "0x1" } },
      ]),
    );

    expect(result.canProceed).toBe(false);
    expect(result.proceedError?.message).toContain("not the active wallet chain");
  });

  it("rejects malformed serialized typed data", async () => {
    const result = await checkAccountAndChainHaveBeenAuthorized(
      request(RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4, [ACCOUNT, "{"]),
    );

    expect(result.canProceed).toBe(false);
    expect(result.proceedError?.message).toContain("cannot parse");
  });

  it("revalidates the bound chain immediately before execution", async () => {
    vi.mocked(StorageUtil.getActiveBlockChain).mockResolvedValue({
      chainId: "0x1",
    } as never);

    const result = await revalidateAuthorizedDAppRequest({
      method: RESTRICTED_METHODS.PERSONAL_SIGN,
      params: ["0x1234", ACCOUNT],
      requestId: "request-id",
      authorizedChainId: "0x539",
      requestData: { senderData: { url: `${ORIGIN}/request` } },
    });

    expect(result.canProceed).toBe(false);
    expect(result.proceedError?.message).toContain("not the active wallet chain");
  });
});
