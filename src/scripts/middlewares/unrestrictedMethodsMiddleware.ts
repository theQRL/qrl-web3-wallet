import { JsonRpcMiddleware } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import { providerErrors } from "@theqrl/qrl-wallet-provider/rpc-errors";
import { Json, JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import browser from "webextension-polyfill";
import { UNRESTRICTED_METHODS } from "../constants/requestConstants";
import { EXTENSION_MESSAGES } from "../constants/streamConstants";
import { checkUrlOriginHasBeenConnected } from "../utils/restrictedMethodsMiddlewareUtils";

const QRL_WALLET_DAPP_CONNECTION_REQUIRED_METHODS: string[] = [
  UNRESTRICTED_METHODS.QRL_ACCOUNTS,
];

// a precheck to determine if the request can proceed
const checkRequestCanProceed = async (req: JsonRpcRequest<JsonRpcRequest>) => {
  if (QRL_WALLET_DAPP_CONNECTION_REQUIRED_METHODS.includes(req.method)) {
    const originConnectResult = await checkUrlOriginHasBeenConnected(
      req?.senderData?.url ?? "",
    );
    if (!originConnectResult.canProceed) {
      return originConnectResult;
    }
  }
  return {
    canProceed: true,
    proceedError: providerErrors.unsupportedMethod(),
  };
};

const getUnrestrictedMethodResult = async (
  req: JsonRpcRequest<JsonRpcRequest>,
) => {
  const tabId = req?.senderData?.tabId ?? 0;
  return await browser.tabs.sendMessage(tabId, {
    name: EXTENSION_MESSAGES.UNRESTRICTED_METHOD_CALLS,
    data: req,
  });
};

type UnrestrictedMethodValue =
  (typeof UNRESTRICTED_METHODS)[keyof typeof UNRESTRICTED_METHODS];

export const unrestrictedMethodsMiddleware: JsonRpcMiddleware<
  JsonRpcRequest,
  Json
> = async (req, res, next, end) => {
  const requestedMethod = req.method;
  if (
    Object.values(UNRESTRICTED_METHODS).includes(
      requestedMethod as UnrestrictedMethodValue,
    )
  ) {
    // check if the request can proceed
    const { canProceed, proceedError } = await checkRequestCanProceed(req);
    if (!canProceed) {
      // @ts-expect-error - proceedError type from provider library is not assignable to res.error's narrow type
      res.error = proceedError;
      return end();
    }

    try {
      res.result = await getUnrestrictedMethodResult(req);
    } catch (error: unknown) {
      res.error = providerErrors.unsupportedMethod({
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return end();
  } else {
    next();
  }
};
