import { DEFAULT_BLOCKCHAIN } from "@/configuration/qrlBlockchainConfig";
import { LEGACY_ACCOUNT_RECOVERY_MESSAGE } from "@/utilities/addressUtil";
import StorageUtil from "@/utilities/storageUtil";
import { JsonRpcEngine } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import type { Json, JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";
import { RESTRICTED_METHODS } from "../constants/requestConstants";
import { EXTENSION_MESSAGES } from "../constants/streamConstants";
import LockManager from "../lockManager/lockManager";
import { restrictedMethodsMiddleware } from "./restrictedMethodsMiddleware";

vi.mock("webextension-polyfill", async (importOriginal) => {
  const original = await importOriginal<{ default: typeof browser }>();
  return {
    default: {
      ...original.default,
      action: { ...original.default.action, openPopup: vi.fn(async () => {}) },
    },
  };
});

const ACCOUNT = `Q${"ab".repeat(64)}`;
const LEGACY_ACCOUNT = `Q${"ab".repeat(20)}`;
const ORIGIN = "https://dapp.example";
const SIGNING_METHODS = [
  RESTRICTED_METHODS.QRL_SEND_TRANSACTION,
  RESTRICTED_METHODS.PERSONAL_SIGN,
  RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4,
];
const rpc = vi.fn();

const request = (method: string, account: string): JsonRpcRequest => ({
  id: 1,
  jsonrpc: "2.0",
  method,
  params:
    method === RESTRICTED_METHODS.QRL_SEND_TRANSACTION
      ? [{ from: account, to: ACCOUNT, value: "0x1" }]
      : method === RESTRICTED_METHODS.PERSONAL_SIGN
        ? ["0x1234", account]
        : [account, { domain: { chainId: DEFAULT_BLOCKCHAIN.chainId } }],
  senderData: { url: ORIGIN },
});

const handle = (method: string, account = ACCOUNT) => {
  const engine = new JsonRpcEngine();
  engine.push(restrictedMethodsMiddleware);
  engine.push((_req, _res, _next, end) => {
    rpc();
    end(new Error("Unexpected RPC call"));
  });
  return engine.handle(request(method, account));
};

const respond = async (response: Json) => {
  await vi.waitFor(() => {
    expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });
  const requestData = vi.mocked(StorageUtil.setDAppsRequestData).mock
    .calls[0][0];
  const listener = vi.mocked(browser.runtime.onMessage.addListener).mock
    .calls[0][0];
  listener(
    {
      action: EXTENSION_MESSAGES.DAPP_RESPONSE,
      method: requestData.method,
      requestId: requestData.requestId,
      hasApproved: true,
      response,
    },
    {},
    () => {},
  );
};

describe("restrictedMethodsMiddleware signing", () => {
  beforeEach(() => {
    vi.spyOn(LockManager, "isLocked").mockResolvedValue({
      isLocked: false,
      hasPasswordSet: true,
    });
    vi.spyOn(LockManager, "getDecryptedKeys").mockReturnValue([
      { address: ACCOUNT, seed: "", mnemonicPhrases: "" },
    ]);
    vi.spyOn(StorageUtil, "getDAppsConnectedAccountsData").mockResolvedValue({
      urlOrigin: ORIGIN,
      accounts: [ACCOUNT, LEGACY_ACCOUNT],
      blockchains: [DEFAULT_BLOCKCHAIN],
      permissions: [],
    });
    vi.spyOn(StorageUtil, "getActiveBlockChain").mockResolvedValue(
      DEFAULT_BLOCKCHAIN,
    );
    vi.spyOn(StorageUtil, "getSettings").mockResolvedValue({
      phishingDetectionEnabled: false,
      sidePanelPreferred: false,
    });
    vi.spyOn(StorageUtil, "setDAppsRequestData").mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe.each(SIGNING_METHODS)("%s", (method) => {
    it.each([
      { accountType: "legacy", account: LEGACY_ACCOUNT, recoveryOnly: false },
      {
        accountType: "legacy recovery-only",
        account: LEGACY_ACCOUNT,
        recoveryOnly: true,
      },
      {
        accountType: "64-byte recovery-only",
        account: ACCOUNT,
        recoveryOnly: true,
      },
      {
        accountType: "lowercase legacy",
        account: LEGACY_ACCOUNT.toLowerCase(),
        recoveryOnly: false,
      },
    ])(
      "rejects a $accountType signer before approval or RPC",
      async ({ account, recoveryOnly }) => {
        vi.mocked(LockManager.getDecryptedKeys).mockReturnValue([
          {
            address: account.toUpperCase(),
            seed: "",
            mnemonicPhrases: "",
            recoveryOnly,
          },
        ]);

        const result = await handle(method, account);

        expect(result).toMatchObject({
          error: { code: 4100, message: LEGACY_ACCOUNT_RECOVERY_MESSAGE },
        });
        expect(result).not.toHaveProperty("result");
        expect(StorageUtil.setDAppsRequestData).not.toHaveBeenCalled();
        expect(browser.action.openPopup).not.toHaveBeenCalled();
        expect(browser.runtime.onMessage.addListener).not.toHaveBeenCalled();
        expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
        expect(rpc).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
      },
    );

    it("keeps approval and success for a 64-byte signer with another recovery-only key", async () => {
      vi.mocked(LockManager.getDecryptedKeys).mockReturnValue([
        {
          address: LEGACY_ACCOUNT,
          seed: "",
          mnemonicPhrases: "",
          recoveryOnly: true,
        },
        { address: ACCOUNT.toUpperCase(), seed: "", mnemonicPhrases: "" },
      ]);
      const signedData = { signature: "0xsignature", publicKey: "0xpublickey" };
      const response =
        method === RESTRICTED_METHODS.QRL_SEND_TRANSACTION
          ? { transactionHash: "0xtransaction" }
          : signedData;
      const pending = handle(method);
      await respond(response);
      const result = await pending;

      expect(result).toEqual({
        id: 1,
        jsonrpc: "2.0",
        result:
          method === RESTRICTED_METHODS.QRL_SEND_TRANSACTION
            ? "0xtransaction"
            : signedData,
      });
      expect(browser.action.openPopup).toHaveBeenCalledTimes(1);
      expect(StorageUtil.setDAppsRequestData).toHaveBeenCalledWith(
        expect.objectContaining({
          method,
          authorizedChainId: DEFAULT_BLOCKCHAIN.chainId,
        }),
      );
    });
  });

  it.each([
    RESTRICTED_METHODS.PERSONAL_SIGN,
    RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4,
  ])("%s returns popup signing errors as RPC errors", async (method) => {
    const pending = handle(method);
    const error = { message: "Signing failed" };
    await respond({ error });
    const result = await pending;

    expect(result).toMatchObject({
      error: { code: 4200, message: error.message, data: error },
    });
    expect(result).not.toHaveProperty("result");
  });

  it("rejects a legacy signer while locked", async () => {
    vi.mocked(LockManager.isLocked).mockResolvedValue({
      isLocked: true,
      hasPasswordSet: true,
    });

    const result = await handle(
      RESTRICTED_METHODS.QRL_SEND_TRANSACTION,
      LEGACY_ACCOUNT,
    );

    expect(result).toMatchObject({
      error: { code: 4100, message: LEGACY_ACCOUNT_RECOVERY_MESSAGE },
    });
    expect(browser.action.openPopup).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a legacy signer while another approval is pending", async () => {
    const pending = handle(RESTRICTED_METHODS.PERSONAL_SIGN);
    await vi.waitFor(() =>
      expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1),
    );

    const result = await handle(
      RESTRICTED_METHODS.QRL_SEND_TRANSACTION,
      LEGACY_ACCOUNT,
    );

    expect(result).toMatchObject({
      error: { code: 4100, message: LEGACY_ACCOUNT_RECOVERY_MESSAGE },
    });
    expect(browser.action.openPopup).toHaveBeenCalledTimes(1);
    expect(StorageUtil.setDAppsRequestData).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    await respond({ signature: "0xsignature" });
    expect(await pending).toMatchObject({
      result: { signature: "0xsignature" },
    });
  });
});
