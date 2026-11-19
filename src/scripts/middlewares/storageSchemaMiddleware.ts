import StorageUtil from "@/utilities/storageUtil";
import { createAsyncMiddleware } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import { providerErrors } from "@theqrl/qrl-wallet-provider/rpc-errors";
import type { Json, JsonRpcParams } from "@theqrl/qrl-wallet-provider/utils";
import { UNRESTRICTED_METHODS } from "../constants/requestConstants";
import { OUTDATED_STORAGE_MESSAGE } from "../lockManager/lockManager";

/**
 * Ends every dApp request while the stored wallet is one an earlier build
 * wrote. The wallet shows its fresh-wallet screen then, and no request may
 * read accounts, connections or keys from that data.
 *
 * The provider's own state request passes. Every page sends it on load, its
 * answer holds the chain and no wallet data, and a refusal would log an error
 * in each page.
 */
export const storageSchemaMiddleware = createAsyncMiddleware<
  JsonRpcParams,
  Json
>(async (req, res, next) => {
  if (
    req.method !== UNRESTRICTED_METHODS.QRL_WEB3_WALLET_GET_PROVIDER_STATE &&
    (await StorageUtil.getStorageSchemaState()) === "outdated"
  ) {
    res.error = providerErrors.disconnected({
      message: OUTDATED_STORAGE_MESSAGE,
    });
    return;
  }
  await next();
});
