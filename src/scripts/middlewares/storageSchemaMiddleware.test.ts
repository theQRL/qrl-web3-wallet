import StorageUtil from "@/utilities/storageUtil";
import { JsonRpcEngine } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import type { JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OUTDATED_STORAGE_MESSAGE } from "../lockManager/lockManager";
import { storageSchemaMiddleware } from "./storageSchemaMiddleware";

const reached = vi.fn();

const handle = (method: string) => {
  const engine = new JsonRpcEngine();
  engine.push(storageSchemaMiddleware);
  engine.push((_req, res, _next, end) => {
    reached();
    res.result = "0x1";
    end();
  });
  const request: JsonRpcRequest = { id: 1, jsonrpc: "2.0", method, params: [] };
  return engine.handle(request);
};

describe("storageSchemaMiddleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    reached.mockClear();
  });

  it.each([
    "qrl_chainId",
    "qrl_accounts",
    "qrl_requestAccounts",
    "qrl_sendTransaction",
    "wallet_revokePermissions",
  ])(
    "ends %s while the stored wallet is from an earlier build",
    async (method) => {
      vi.spyOn(StorageUtil, "getStorageSchemaState").mockResolvedValue(
        "outdated",
      );

      const result = await handle(method);

      expect(result).toMatchObject({
        error: { code: 4900, message: OUTDATED_STORAGE_MESSAGE },
      });
      expect(result).not.toHaveProperty("result");
      expect(reached).not.toHaveBeenCalled();
    },
  );

  it("lets the provider's state request through without reading the store", async () => {
    const readState = vi
      .spyOn(StorageUtil, "getStorageSchemaState")
      .mockResolvedValue("outdated");

    expect(await handle("qrlWallet_getProviderState")).toMatchObject({
      result: "0x1",
    });
    expect(readState).not.toHaveBeenCalled();
  });

  it("lets a request through when the store is current", async () => {
    vi.spyOn(StorageUtil, "getStorageSchemaState").mockResolvedValue("current");

    expect(await handle("qrl_chainId")).toMatchObject({ result: "0x1" });
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it("ends the request with an error when the store cannot be read", async () => {
    vi.spyOn(StorageUtil, "getStorageSchemaState").mockRejectedValue(
      new Error("storage unavailable"),
    );

    const result = await handle("qrl_requestAccounts");

    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("result");
    expect(reached).not.toHaveBeenCalled();
  });
});
