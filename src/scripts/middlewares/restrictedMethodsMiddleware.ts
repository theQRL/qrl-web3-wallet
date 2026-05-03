import StorageUtil from "@/utilities/storageUtil";
import { JsonRpcMiddleware } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import {
  providerErrors,
  rpcErrors,
} from "@theqrl/qrl-wallet-provider/rpc-errors";
import { Json, JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import browser from "webextension-polyfill";
import { RESTRICTED_METHODS } from "../constants/requestConstants";
import { EXTENSION_MESSAGES } from "../constants/streamConstants";
import { checkDomain } from "../phishing/phishingDetector";
import {
  checkAccountHasBeenAuthorized,
  checkUrlOriginHasBeenConnected,
  checkWalletAddQrlChainParams,
  checkWalletRequestPermissionParams,
  checkWalletSendCallsParams,
  checkWalletSwitchQrlChainParams,
  checkWalletWatchAssetParams,
  updateAccountsAndBlockchainsForUrlOrigin,
} from "../utils/restrictedMethodsMiddlewareUtils";
import { DAppRequestType, DAppResponseType } from "./middlewareTypes";

const QRL_WALLET_DAPP_CONNECTION_REQUIRED_METHODS: string[] = [
  RESTRICTED_METHODS.WALLET_ADD_QRL_CHAIN,
  RESTRICTED_METHODS.WALLET_GET_CAPABILITIES,
  RESTRICTED_METHODS.WALLET_SWITCH_QRL_CHAIN,
];

const checkRequestCanCompleteSilently = async (
  req: JsonRpcRequest<JsonRpcRequest>,
) => {
  if (req.method === RESTRICTED_METHODS.WALLET_ADD_QRL_CHAIN) {
    const [chainData] = (req.params as unknown) as { chainId: string }[];
    const chainId = chainData?.chainId;
    const blockchains = await StorageUtil.getAllBlockChains();
    const chainFound = !!blockchains.find(
      (chain) => chain.chainId.toLowerCase() === chainId.toLowerCase(),
    );
    if (chainFound) {
      await StorageUtil.setActiveBlockChain(chainId);
      return {
        hasCompleted: true,
        completionResult: null,
      };
    }
    return {
      hasCompleted: false,
    };
  } else if (req.method === RESTRICTED_METHODS.WALLET_SWITCH_QRL_CHAIN) {
    const [chainData] = (req.params as unknown) as { chainId: string }[];
    const chainId = chainData?.chainId;

    const currentChainId = (await StorageUtil.getActiveBlockChain())?.chainId;
    const isAlreadyCurrentChain =
      chainId?.toLowerCase() === currentChainId?.toLowerCase();
    const dAppConnectedChains = await StorageUtil.getDAppsConnectedAccountsData(
      new URL(req?.senderData?.url ?? "").origin,
    );
    const isDAppConnectedChain = dAppConnectedChains?.blockchains
      ?.map((chain) => chain.chainId.toLowerCase())
      ?.includes(chainId?.toLowerCase());
    if (isAlreadyCurrentChain || isDAppConnectedChain) {
      await StorageUtil.setActiveBlockChain(chainId);
      return {
        hasCompleted: true,
        completionResult: null,
      };
    }

    const chainIdsForOrigin = (
      await StorageUtil.getDAppsConnectedAccountsData(
        new URL(req.senderData?.url ?? "").origin,
      )
    )?.blockchains;
    if (chainIdsForOrigin?.some((chain) => chain.chainId === chainId)) {
      await StorageUtil.setActiveBlockChain(chainId);
      return {
        hasCompleted: true,
        completionResult: null,
      };
    }

    return {
      hasCompleted: false,
    };
  } else if (req.method === RESTRICTED_METHODS.WALLET_GET_CAPABILITIES) {
    try {
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      const chains: string[] = req?.params?.[1] ?? [];
      const capabilities: { [k: string]: { atomic: { status: "ready" | "supported" } } } = {};
      chains.forEach((chain) => {
        // TODO: Update this with delegation system once ready
        const status: "ready" | "supported" = "ready";
        capabilities[chain] = { atomic: { status } };
      });

      return {
        hasCompleted: true,
        completionResult: capabilities,
      };
    } catch {
      return {
        hasCompleted: false,
        completionResult: null,
        completionError: rpcErrors.invalidParams({
          message: "The wallet cannot parse the request.",
        }),
      };
    }
  } else {
    return {
      hasCompleted: false,
    };
  }
};

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
  switch (req.method) {
    case RESTRICTED_METHODS.WALLET_ADD_QRL_CHAIN:
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      return await checkWalletAddQrlChainParams(req?.params?.[0]);
    case RESTRICTED_METHODS.WALLET_SWITCH_QRL_CHAIN:
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      return await checkWalletSwitchQrlChainParams(req?.params?.[0]);
    case RESTRICTED_METHODS.WALLET_WATCH_ASSET:
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      return await checkWalletWatchAssetParams(req?.params?.[0]);
    case RESTRICTED_METHODS.WALLET_REQUEST_PERMISSIONS:
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      return await checkWalletRequestPermissionParams(req?.params?.[0]);
    case RESTRICTED_METHODS.WALLET_SEND_CALLS:
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      return await checkWalletSendCallsParams(req?.params?.[0]);
    case RESTRICTED_METHODS.WALLET_GET_CAPABILITIES:
    case RESTRICTED_METHODS.QRL_SEND_TRANSACTION:
    case RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4:
    case RESTRICTED_METHODS.PERSONAL_SIGN:
      return await checkAccountHasBeenAuthorized(req);
    default:
      return {
        canProceed: true,
        proceedError: undefined,
      };
  }
};

// get the result of the user approval/rejection of the request
const getRestrictedMethodResult = async (
  req: JsonRpcRequest<JsonRpcRequest>,
): Promise<DAppResponseType> => {
  const settings = await StorageUtil.getSettings();
  const phishingEnabled = settings.phishingDetectionEnabled !== false;
  const phishingResult = phishingEnabled
    ? checkDomain(req.senderData?.url ?? "")
    : { isDomainPhishing: false };
  const request: DAppRequestType = {
    method: req.method,
    params: req.params,
    requestData: { senderData: req.senderData },
    phishingResult,
  };

  await StorageUtil.setDAppsRequestData(request);
  try {
    await browser.action.openPopup();
  } catch {
    console.warn("QrlWeb3Wallet: Could not open the wallet");
  }

  return new Promise((resolve) => {
    const handleMessage = function messageHandler(message: DAppResponseType) {
      if (message.action === EXTENSION_MESSAGES.DAPP_RESPONSE) {
        // Remove the listener when the message is processed
        browser.runtime.onMessage.removeListener(handleMessage);
        resolve(message);
      }
    };
    // Listen for the approval/rejection from the UI
    browser.runtime.onMessage.addListener(handleMessage);
  });
};

let isRequestPending = false;

type RestrictedMethodValue =
  (typeof RESTRICTED_METHODS)[keyof typeof RESTRICTED_METHODS];

export const restrictedMethodsMiddleware: JsonRpcMiddleware<
  JsonRpcRequest,
  Json
> = async (req, res, next, end) => {
  const requestedMethod = req.method;
  if (
    Object.values(RESTRICTED_METHODS).includes(
      requestedMethod as RestrictedMethodValue,
    )
  ) {
    if (isRequestPending) {
      try {
        await browser.action.openPopup();
      } finally {
        res.error = providerErrors.unsupportedMethod({
          message: "A request is already pending",
        });
      }
      return end();
    } else {
      // check if the request can proceed
      const { canProceed, proceedError } = await checkRequestCanProceed(req);
      if (!canProceed) {
        // @ts-expect-error - proceedError type from provider library is not assignable to res.error's narrow type
        res.error = proceedError;
        return end();
      }

      // check if the request can complete silently without user interaction
      const { hasCompleted, completionResult, completionError } =
        await checkRequestCanCompleteSilently(req);
      if (hasCompleted) {
        res.result = completionResult;
        return end();
      } else if (completionError) {
        // @ts-expect-error - completionError type from rpcErrors is not assignable to res.error's narrow type
        res.error = completionError;
        return end();
      }

      // open the popup and wait for the user to approve/reject the request
      let restrictedMethodResult: DAppResponseType = {
        method: "",
        action: "",
        hasApproved: false,
      };
      try {
        isRequestPending = true;
        restrictedMethodResult = await getRestrictedMethodResult(req);
      } finally {
        isRequestPending = false;
        const hasApproved = restrictedMethodResult?.hasApproved;
        if (hasApproved) {
          switch (restrictedMethodResult?.method) {
            case RESTRICTED_METHODS.WALLET_ADD_QRL_CHAIN:
            case RESTRICTED_METHODS.WALLET_SWITCH_QRL_CHAIN: {
              const switchApproved = !!restrictedMethodResult?.response?.result;
              res.result = switchApproved ? null : false;
              break;
            }
            case RESTRICTED_METHODS.WALLET_WATCH_ASSET: {
              const hasAddedAsset = !!restrictedMethodResult?.response?.result;
              res.result = hasAddedAsset;
              break;
            }
            case RESTRICTED_METHODS.QRL_REQUEST_ACCOUNTS: {
              const accounts = await updateAccountsAndBlockchainsForUrlOrigin({
                urlOrigin: new URL(req?.senderData?.url ?? "").origin,
                accounts: restrictedMethodResult?.response?.accounts,
                blockchains: restrictedMethodResult?.response?.blockchains,
              });
              res.result = accounts;
              break;
            }
            case RESTRICTED_METHODS.WALLET_REQUEST_PERMISSIONS: {
              const urlOrigin = new URL(req?.senderData?.url ?? "").origin;
              await updateAccountsAndBlockchainsForUrlOrigin({
                urlOrigin,
                accounts: restrictedMethodResult?.response?.accounts,
                blockchains: restrictedMethodResult?.response?.blockchains,
              });
              const dAppConnectedAccountsData =
                await StorageUtil.getDAppsConnectedAccountsData(urlOrigin);
              res.result = dAppConnectedAccountsData?.permissions ?? [];
              break;
            }
            case RESTRICTED_METHODS.WALLET_SEND_CALLS: {
              const batchId = restrictedMethodResult?.response?.batchId;
              if (batchId) {
                res.result = { id: batchId };
              } else {
                res.error = providerErrors.unsupportedMethod({
                  message: restrictedMethodResult?.response?.error?.message,
                  data: restrictedMethodResult?.response?.error,
                });
              }
              break;
            }
            case RESTRICTED_METHODS.QRL_SEND_TRANSACTION: {
              const transactionHash =
                restrictedMethodResult?.response?.transactionHash;
              if (transactionHash) {
                res.result = transactionHash;
              } else {
                res.error = providerErrors.unsupportedMethod({
                  message: restrictedMethodResult?.response?.error?.message,
                  data: restrictedMethodResult?.response?.error,
                });
              }
              break;
            }
            case RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4:
            case RESTRICTED_METHODS.PERSONAL_SIGN: {
              const signedData = restrictedMethodResult?.response;
              if (signedData) {
                res.result = signedData;
              } else {
                res.error = providerErrors.unsupportedMethod({
                  message: restrictedMethodResult?.response?.error?.message,
                  data: restrictedMethodResult?.response?.error,
                });
              }
              break;
            }
            default:
              res.error = providerErrors.unsupportedMethod();
              break;
          }
        } else {
          res.error = providerErrors.userRejectedRequest();
        }
      }
      return end();
    }
  } else {
    next();
  }
};
