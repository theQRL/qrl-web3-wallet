import { DEFAULT_BLOCKCHAIN } from "@/configuration/qrlBlockchainConfig";
import StorageUtil from "@/utilities/storageUtil";
import { JsonRpcEngine } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import type { Json, JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import Web3 from "@theqrl/web3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";
import { RESTRICTED_METHODS } from "../constants/requestConstants";
import { EXTENSION_MESSAGES } from "../constants/streamConstants";
import LockManager from "../lockManager/lockManager";
import { TYPED_DATA_V4_UNSUPPORTED_MESSAGE } from "../utils/restrictedMethodsMiddlewareUtils";
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
const ORIGIN = "https://dapp.example";
const SIGNING_METHODS = [
  RESTRICTED_METHODS.QRL_SEND_TRANSACTION,
  RESTRICTED_METHODS.PERSONAL_SIGN,
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
  void listener(
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
      accounts: [ACCOUNT],
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
    it("returns the authorization error for an unconnected origin", async () => {
      vi.mocked(StorageUtil.getDAppsConnectedAccountsData).mockResolvedValue(
        undefined,
      );

      expect(await handle(method)).toMatchObject({
        error: {
          code: 4100,
          message: `The requested account ${ACCOUNT} has not been authorized by the user.`,
        },
      });
      expect(LockManager.isLocked).not.toHaveBeenCalled();
      expect(LockManager.getDecryptedKeys).not.toHaveBeenCalled();
      expect(StorageUtil.setDAppsRequestData).not.toHaveBeenCalled();
      expect(browser.action.openPopup).not.toHaveBeenCalled();
      expect(browser.runtime.onMessage.addListener).not.toHaveBeenCalled();
      expect(browser.tabs.sendMessage).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    });

    it("asks for approval and returns the approved result", async () => {
      const signedData = {
        signature: "0xsignature",
        publicKey: "0xpublickey",
      };
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

  describe("a send request that names another transaction type", () => {
    const handleSend = (transaction: { type?: string; gasPrice?: string }) => {
      const engine = new JsonRpcEngine();
      engine.push(restrictedMethodsMiddleware);
      return engine.handle({
        ...request(RESTRICTED_METHODS.QRL_SEND_TRANSACTION, ACCOUNT),
        params: [{ from: ACCOUNT, to: ACCOUNT, value: "0x1", ...transaction }],
      });
    };

    it.each(["0x0", "0x1", "0x3"])(
      "refuses type %s before the user is asked",
      async (type) => {
        expect(await handleSend({ type })).toMatchObject({
          error: {
            code: -32602,
            message: `QRL transactions are of type 0x2. Received type: "${type}"`,
          },
        });
        expect(StorageUtil.setDAppsRequestData).not.toHaveBeenCalled();
        expect(browser.action.openPopup).not.toHaveBeenCalled();
      },
    );

    it("keeps the authorization answer for an account that is not connected", async () => {
      vi.mocked(StorageUtil.getDAppsConnectedAccountsData).mockResolvedValue(
        undefined,
      );

      expect(await handleSend({ type: "0x0" })).toMatchObject({
        error: { code: 4100 },
      });
    });

    it.each([{ type: "0x2" }, { type: "0x02" }, { gasPrice: "0x3b9aca00" }])(
      "asks for approval of a request with %j",
      async (transaction) => {
        const pending = handleSend(transaction);
        await respond({ transactionHash: "0xtransaction" });

        expect(await pending).toMatchObject({ result: "0xtransaction" });
        expect(browser.action.openPopup).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe("a send request that names its call data as input", () => {
    const CALL = `0xa9059cbb${"00".repeat(63)}ff`;
    const CONTRACT = `Q${"ef".repeat(64)}`;
    const handleSend = (transaction: Record<string, unknown>) => {
      const engine = new JsonRpcEngine();
      engine.push(restrictedMethodsMiddleware);
      return engine.handle({
        ...request(RESTRICTED_METHODS.QRL_SEND_TRANSACTION, ACCOUNT),
        // As JSON, the way a request crosses from the page to the worker.
        params: [
          JSON.parse(
            JSON.stringify({
              from: ACCOUNT,
              to: CONTRACT,
              gas: "0x186a0",
              ...transaction,
            }),
          ) as Json,
        ],
      });
    };
    const storedTransaction = () => {
      const stored = vi.mocked(StorageUtil.setDAppsRequestData).mock
        .calls[0][0];
      const [transaction] = stored.params as Record<string, unknown>[];
      return transaction;
    };

    it.each([
      ["as input only", { input: CALL }],
      ["as input beside the same data", { input: CALL, data: CALL }],
      [
        "as input beside the same data in another case",
        { input: CALL, data: CALL.toUpperCase().replace("0X", "0x") },
      ],
      ["as input beside a null data", { input: CALL, data: null }],
    ])(
      "stores the call data as data for the approval when it comes %s",
      async (_label, fields) => {
        const pending = handleSend({ value: "0x1", ...fields });
        await respond({ transactionHash: "0xtransaction" });

        expect(await pending).toMatchObject({ result: "0xtransaction" });
        const transaction = storedTransaction();
        expect(String(transaction.data).toLowerCase()).toBe(CALL);
        expect("input" in transaction).toBe(false);
        expect(transaction).toMatchObject({
          from: ACCOUNT,
          to: CONTRACT,
          gas: "0x186a0",
          value: "0x1",
        });
      },
    );

    it("stores a request without input as it came", async () => {
      const pending = handleSend({ data: CALL });
      await respond({ transactionHash: "0xtransaction" });
      await pending;

      expect(storedTransaction()).toEqual({
        from: ACCOUNT,
        to: CONTRACT,
        gas: "0x186a0",
        data: CALL,
      });
    });

    it.each([
      [
        "other bytes as data",
        { input: CALL, data: "0x01" },
        '"data" and "input" are both set and differ',
      ],
      [
        "an empty data",
        { input: CALL, data: "0x" },
        '"data" and "input" are both set and differ',
      ],
      [
        "an input that is no text",
        { input: 1 },
        '"input" has to be a hex string',
      ],
    ])(
      "refuses a request with %s before the user is asked",
      async (_label, fields, message) => {
        expect(await handleSend(fields)).toMatchObject({
          error: { code: -32602, message },
        });
        expect(StorageUtil.setDAppsRequestData).not.toHaveBeenCalled();
        expect(browser.action.openPopup).not.toHaveBeenCalled();
      },
    );

    it("keeps the authorization answer for an account that is not connected", async () => {
      vi.mocked(StorageUtil.getDAppsConnectedAccountsData).mockResolvedValue(
        undefined,
      );

      expect(await handleSend({ input: CALL, data: "0x01" })).toMatchObject({
        error: { code: 4100 },
      });
    });

    it("stores a contract call made with the library with its call data", async () => {
      // What the library hands to an injected provider for
      // contract.methods.deposit(...).send(...): the request is caught here
      // on its way out.
      const sent: unknown[] = [];
      const web3 = new Web3({
        request: ({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) => {
          if (method === "qrl_sendTransaction") {
            sent.push(params?.[0]);
            return Promise.reject(new Error("captured"));
          }
          const answers: Record<string, unknown> = {
            qrl_chainId: "0x301825",
            net_version: "3151909",
            qrl_getTransactionCount: "0x1",
            qrl_estimateGas: "0x186a0",
            qrl_maxPriorityFeePerGas: "0x3b9aca00",
            qrl_call: "0x",
            qrl_getBlockByNumber: {
              baseFeePerGas: "0x3b9aca00",
              number: "0x10",
              hash: `0x${"11".repeat(32)}`,
              transactions: [],
            },
          };
          return method in answers
            ? Promise.resolve(answers[method])
            : Promise.reject(new Error(`unexpected ${method}`));
        },
      });
      const payable = [
        {
          type: "function",
          name: "deposit",
          stateMutability: "payable",
          inputs: [{ name: "beneficiary", type: "address" }],
          outputs: [],
        },
      ] as const;
      await new web3.qrl.Contract(payable, CONTRACT).methods
        .deposit(ACCOUNT)
        .send({ from: ACCOUNT, value: "1000000000000000000", gas: "100000" })
        .catch(() => undefined);
      const [fromLibrary] = sent as Record<string, unknown>[];
      // The library names the call data `input` and sends no `data`.
      expect(fromLibrary.input).toMatch(/^0xf340fa01/);
      expect(fromLibrary.data).toBeUndefined();

      const engine = new JsonRpcEngine();
      engine.push(restrictedMethodsMiddleware);
      const pending = engine.handle({
        ...request(RESTRICTED_METHODS.QRL_SEND_TRANSACTION, ACCOUNT),
        params: [JSON.parse(JSON.stringify(fromLibrary)) as Json],
      });
      await respond({ transactionHash: "0xtransaction" });
      await pending;

      const transaction = storedTransaction();
      expect(transaction.data).toBe(fromLibrary.input);
      expect("input" in transaction).toBe(false);
      expect(transaction.value).toBe(fromLibrary.value);
    }, 60000);
  });

  describe("typed data v4", () => {
    const refusal = {
      error: { code: 4200, message: TYPED_DATA_V4_UNSUPPORTED_MESSAGE },
    };
    const expectNoApproval = () => {
      expect(StorageUtil.setDAppsRequestData).not.toHaveBeenCalled();
      expect(browser.action.openPopup).not.toHaveBeenCalled();
      expect(browser.runtime.onMessage.addListener).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    };

    it.each([
      { state: "unlocked", isLocked: false },
      { state: "locked", isLocked: true },
    ])(
      "refuses a connected origin the same way when $state, without consulting the lock manager",
      async ({ isLocked }) => {
        vi.mocked(LockManager.isLocked).mockResolvedValue({
          isLocked,
          hasPasswordSet: true,
        });

        const result = await handle(RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4);

        expect(result).toMatchObject(refusal);
        expect(result).not.toHaveProperty("result");
        expect(LockManager.isLocked).not.toHaveBeenCalled();
        expect(LockManager.getDecryptedKeys).not.toHaveBeenCalled();
        expectNoApproval();
      },
    );

    it("keeps the authorization answer for an unconnected origin", async () => {
      vi.mocked(StorageUtil.getDAppsConnectedAccountsData).mockResolvedValue(
        undefined,
      );

      expect(
        await handle(RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4),
      ).toMatchObject({
        error: {
          code: 4100,
          message: `The requested account ${ACCOUNT} has not been authorized by the user.`,
        },
      });
      expectNoApproval();
    });

    it("refuses while another approval is pending without disturbing it", async () => {
      const pending = handle(RESTRICTED_METHODS.PERSONAL_SIGN);
      await vi.waitFor(() => {
        expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
      });

      const result = await handle(RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4);

      expect(result).toMatchObject(refusal);
      expect(browser.action.openPopup).toHaveBeenCalledTimes(1);
      expect(StorageUtil.setDAppsRequestData).toHaveBeenCalledTimes(1);
      await respond({ signature: "0xsignature" });
      expect(await pending).toMatchObject({
        result: { signature: "0xsignature" },
      });
    });
  });

  it.each([RESTRICTED_METHODS.PERSONAL_SIGN])(
    "%s returns popup signing errors as RPC errors",
    async (method) => {
      const pending = handle(method);
      const error = { message: "Signing failed" };
      await respond({ error });
      const result = await pending;

      expect(result).toMatchObject({
        error: { code: 4200, message: error.message, data: error },
      });
      expect(result).not.toHaveProperty("result");
    },
  );
});
