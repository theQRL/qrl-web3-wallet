import StorageUtil from "@/utilities/storageUtil";
import { JsonRpcMiddleware } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import { v4 as uuid } from "uuid";
import {
  providerErrors,
  rpcErrors,
} from "@theqrl/qrl-wallet-provider/rpc-errors";
import { Json, JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import browser from "webextension-polyfill";
import { RESTRICTED_METHODS } from "../constants/requestConstants";
import {
  DAPP_REQUEST_PORT_NAME,
  EXTENSION_MESSAGES,
} from "../constants/streamConstants";
import { checkDomain } from "../phishing/phishingDetector";
import {
  checkAccountHasBeenAuthorized,
  checkUrlOriginHasBeenConnected,
  checkWalletAddQrlChainParams,
  checkWalletRequestPermissionParams,
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
      // Chain is already known to the wallet — acknowledge per EIP-3085 but do
      // NOT silently flip the globally-active chain. The dApp must call
      // wallet_switchQRLChain explicitly (which surfaces to the user). F-2.
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
    if (isAlreadyCurrentChain) {
      // No-op switch — permitted per EIP-3326 / MetaMask. Any other target
      // (including a chain already in this dApp's permission list) must open
      // the popup so the user authorises the global active-chain change. F-1.
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
      // EIP-5792 wallet_sendCalls is not implemented in this wallet; advertise
      // atomic as "supported" (the weaker tier) rather than "ready" so dApps
      // do not dispatch wallet_sendCalls expecting it to succeed. Promote to
      // "ready" once the delegation system lands.
      chains.forEach((chain) => {
        capabilities[chain] = { atomic: { status: "supported" } };
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
  // Phishing is checked against both the requesting frame origin AND the
  // parent tab origin. A phishing top-level page hosting a connected dApp's
  // iframe is a real attack vector that frame-origin-only checking misses.
  const senderData = req.senderData as
    | {
        url?: string;
        mainFrameOrigin?: string;
      }
    | undefined;
  const frameResult = phishingEnabled
    ? checkDomain(senderData?.url ?? "")
    : { isDomainPhishing: false };
  const parentResult =
    phishingEnabled && senderData?.mainFrameOrigin
      ? checkDomain(senderData.mainFrameOrigin)
      : { isDomainPhishing: false };
  const phishingResult = {
    isDomainPhishing:
      frameResult.isDomainPhishing || parentResult.isDomainPhishing,
    matchType: frameResult.isDomainPhishing
      ? frameResult.matchType
      : parentResult.matchType,
    matchedDomain: frameResult.isDomainPhishing
      ? frameResult.matchedDomain
      : parentResult.matchedDomain,
    detectorStatus: frameResult.detectorStatus ?? parentResult.detectorStatus,
  };
  const requestId = uuid();
  const request: DAppRequestType = {
    method: req.method,
    params: req.params,
    requestData: { senderData: req.senderData },
    phishingResult,
    requestId,
  };

  await StorageUtil.setDAppsRequestData(request);
  // In side-panel mode the user opens the side panel by clicking the
  // extension action icon (configured via setPanelBehavior). Calling
  // openPopup() in that mode spawns a competing approval surface, so
  // we skip it and rely on the badge + side-panel storage subscription
  // to surface the request.
  if (!settings.sidePanelPreferred) {
    try {
      await browser.action.openPopup();
    } catch {
      console.warn("QrlWeb3Wallet: Could not open the wallet");
    }
  }

  // Safety timeout: if the popup never connects its lifecycle port (e.g.
  // openPopup() failed) and never posts a DAPP_RESPONSE, fall through here so
  // isRequestPending eventually resets. Most popup-close paths now resolve
  // via the lifecycle-port disconnect handler below.
  const POPUP_RESPONSE_TIMEOUT_MS = 90 * 1000;

  return new Promise((resolve) => {
    let popupPort: browser.Runtime.Port | undefined;
    const cleanup = () => {
      clearTimeout(timeoutHandle);
      browser.runtime.onMessage.removeListener(handleMessage);
      browser.runtime.onConnect.removeListener(handlePortConnect);
      popupPort?.onDisconnect.removeListener(handlePortDisconnect);
    };
    function handleMessage(message: DAppResponseType) {
      if (
        message.action === EXTENSION_MESSAGES.DAPP_RESPONSE &&
        message.requestId === requestId
      ) {
        cleanup();
        resolve(message);
      }
    }
    function handlePortConnect(port: browser.Runtime.Port) {
      if (port.name === DAPP_REQUEST_PORT_NAME) {
        popupPort = port;
        port.onDisconnect.addListener(handlePortDisconnect);
      }
    }
    async function handlePortDisconnect() {
      cleanup();
      try {
        await StorageUtil.clearDAppsRequestData();
      } catch {
        // best-effort cleanup
      }
      resolve({
        method: req.method,
        action: EXTENSION_MESSAGES.DAPP_RESPONSE,
        hasApproved: false,
      });
    }
    const timeoutHandle = setTimeout(async () => {
      cleanup();
      console.warn(
        "QrlWeb3Wallet: dApp request timed out without user response",
      );
      try {
        await StorageUtil.clearDAppsRequestData();
      } catch {
        // best-effort cleanup
      }
      resolve({
        method: req.method,
        action: EXTENSION_MESSAGES.DAPP_RESPONSE,
        hasApproved: false,
      });
    }, POPUP_RESPONSE_TIMEOUT_MS);
    // Listen for the approval/rejection from the UI, plus the popup's
    // lifecycle port so we can resolve immediately when it disconnects.
    browser.runtime.onMessage.addListener(handleMessage);
    browser.runtime.onConnect.addListener(handlePortConnect);
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
        const settings = await StorageUtil.getSettings();
        if (!settings.sidePanelPreferred) {
          await browser.action.openPopup();
        }
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
