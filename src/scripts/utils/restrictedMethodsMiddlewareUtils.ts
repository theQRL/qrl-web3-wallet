import {
  JsonRpcRequest,
  providerErrors,
  rpcErrors,
} from "@theqrl/qrl-wallet-provider";
import { RESTRICTED_METHODS } from "../constants/requestConstants";
import StorageUtil from "@/utilities/storageUtil";
import { MAX_SAFE_CHAIN_ID } from "@/constants/blockchain";
import { BlockchainDataType } from "@/configuration/qrlBlockchainConfig";
import {
  CAVEAT_TYPES,
  PARENT_CAPABILITIES,
  Permission,
} from "../middlewares/middlewareTypes";

const getFromAddress = (req: JsonRpcRequest<JsonRpcRequest>) => {
  switch (req.method) {
    case RESTRICTED_METHODS.QRL_SEND_TRANSACTION:
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      return req.params?.[0]?.from ?? "";
    case RESTRICTED_METHODS.WALLET_GET_CAPABILITIES:
    case RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4:
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      return req.params?.[0];
    case RESTRICTED_METHODS.PERSONAL_SIGN:
      // @ts-expect-error - params is typed as JsonRpcParams but is an array at runtime for this RPC method
      return req.params?.[1];
  }
};

export const checkAccountHasBeenAuthorized = async (
  req: JsonRpcRequest<JsonRpcRequest>,
) => {
  const fromAddress = getFromAddress(req);
  const urlOrigin = new URL(req?.senderData?.url ?? "").origin;
  const connectedAccounts =
    await StorageUtil.getDAppsConnectedAccountsData(urlOrigin);
  const hasAddressConnected =
    connectedAccounts?.accounts.includes(fromAddress) ?? false;
  return {
    canProceed: hasAddressConnected,
    proceedError: providerErrors.unauthorized({
      message: `The requested account ${fromAddress} has not been authorized by the user.`,
    }),
  };
};

const isAcceptableUrl = (urlString: string) => {
  try {
    const url = new URL(urlString);

    if (
      url === null ||
      url.hostname.length === 0 ||
      url.pathname.length === 0 ||
      url.hostname !== decodeURIComponent(url.hostname)
    ) {
      return false;
    }

    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.protocol === "https:"
    );
  } catch {
    return false;
  }
};

export const checkWalletAddQrlChainParams = async (
  chainData: BlockchainDataType,
  hasInternalKeys: boolean = false,
) => {
  if (!chainData || typeof chainData !== "object") {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Expected an object parameter. Received: ${JSON.stringify(
          chainData,
        )}`,
      }),
    };
  }

  const internalKeys = [
    "defaultRpcUrl",
    "defaultBlockExplorerUrl",
    "defaultIconUrl",
    "isTestnet",
    "defaultWsRpcUrl",
    "isCustomChain",
    "qrnsRegistryAddress",
  ];
  const allowedKeys = [
    "chainName",
    "chainId",
    "nativeCurrency",
    "rpcUrls",
    "blockExplorerUrls",
    "iconUrls",
    ...(hasInternalKeys ? internalKeys : []),
  ];
  const extraKeys = Object.keys(chainData).filter((key) => {
    return !allowedKeys.includes(key);
  });
  if (extraKeys.length) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Received unexpected keys on object parameter. Unsupported keys: ${extraKeys}`,
      }),
    };
  }

  const chainId = chainData?.chainId;
  if (
    typeof chainId !== "string" ||
    !/^0x[1-9a-f]+[0-9a-f]*$/iu.test(chainId.toLowerCase())
  ) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Expected 0x-prefixed, unpadded, non-zero hexadecimal string 'chainId'. Received: ${chainId}`,
      }),
    };
  }
  const chainIdNumber = parseInt(chainId, 16);
  if (
    !Number.isSafeInteger(chainIdNumber) ||
    chainIdNumber < 0 ||
    chainIdNumber > MAX_SAFE_CHAIN_ID
  ) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Invalid chain ID "${chainId}": numerical value should be in the inclusive range of 0 and ${MAX_SAFE_CHAIN_ID}. Received: ${chainId}`,
      }),
    };
  }

  const chainName = chainData?.chainName;
  if (typeof chainName !== "string" || !chainName) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Expected non-empty string 'chainName'. Received: ${chainName}`,
      }),
    };
  }

  const rpcUrls = chainData?.rpcUrls;
  if (
    !rpcUrls ||
    !Array.isArray(rpcUrls) ||
    rpcUrls.length === 0 ||
    !rpcUrls.find((rpcUrl) => isAcceptableUrl(rpcUrl))
  ) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Expected an array with at least one valid string HTTPS url 'rpcUrls', Received: ${rpcUrls}`,
      }),
    };
  }

  const nativeCurrency = chainData?.nativeCurrency;
  if (nativeCurrency !== null) {
    if (typeof nativeCurrency !== "object" || Array.isArray(nativeCurrency)) {
      return {
        canProceed: false,
        proceedError: rpcErrors.invalidParams({
          message: `Expected null or object 'nativeCurrency'. Received: ${nativeCurrency}`,
        }),
      };
    }
    if (nativeCurrency.decimals !== 18) {
      return {
        canProceed: false,
        proceedError: rpcErrors.invalidParams({
          message: `Expected the number 18 for 'nativeCurrency.decimals' when 'nativeCurrency' is provided. Received: ${nativeCurrency.decimals}`,
        }),
      };
    }
    if (!nativeCurrency.symbol || typeof nativeCurrency.symbol !== "string") {
      return {
        canProceed: false,
        proceedError: rpcErrors.invalidParams({
          message: `Expected a string 'nativeCurrency.symbol'. Received: ${nativeCurrency.symbol}`,
        }),
      };
    }
  }
  const ticker = nativeCurrency?.symbol;
  if (
    ticker &&
    (typeof ticker !== "string" || ticker.length < 1 || ticker.length > 6)
  ) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Expected 1-6 character string 'nativeCurrency.symbol'. Received: ${ticker}`,
      }),
    };
  }

  const blockchains = await StorageUtil.getAllBlockChains();
  const existingChain = blockchains.find((chain) => chain.chainId === chainId);
  if (existingChain && existingChain?.nativeCurrency?.symbol !== ticker) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `nativeCurrency.symbol does not match currency symbol for a network the user already has added with the same chainId. Received: ${ticker}`,
      }),
    };
  }

  return {
    canProceed: true,
    proceedError: undefined,
  };
};

export const checkUrlOriginHasBeenConnected = async (url: string) => {
  const urlOrigin = new URL(url).origin;
  const connectedAccounts =
    (await StorageUtil.getDAppsConnectedAccountsData(urlOrigin))?.accounts ??
    [];
  const hasConnectedAccounts = connectedAccounts.length > 0;
  return {
    canProceed: hasConnectedAccounts,
    proceedError: providerErrors.unauthorized({
      message: "The dApp is not connected to the QRL Web3 Wallet.",
    }),
  };
};

export const checkWalletSwitchQrlChainParams = async (paramObject: {
  chainId: string;
}) => {
  if (!paramObject || typeof paramObject !== "object") {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Expected single, object parameter. Received: ${JSON.stringify(
          paramObject,
        )}`,
      }),
    };
  }

  const allowedKeys = ["chainId"];
  const extraKeys = Object.keys(paramObject).filter((key) => {
    return !allowedKeys.includes(key);
  });
  if (extraKeys.length) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Received unexpected keys on object parameter. Unsupported keys: ${extraKeys}`,
      }),
    };
  }

  const chainId = paramObject?.chainId;
  if (
    typeof chainId !== "string" ||
    !/^0x[1-9a-f]+[0-9a-f]*$/iu.test(chainId.toLowerCase())
  ) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Expected 0x-prefixed, unpadded, non-zero hexadecimal string 'chainId'. Received: ${chainId}`,
      }),
    };
  }
  const chainIdNumber = parseInt(chainId, 16);
  if (
    !Number.isSafeInteger(chainIdNumber) ||
    chainIdNumber < 0 ||
    chainIdNumber > MAX_SAFE_CHAIN_ID
  ) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Invalid chain ID "${chainId}": numerical value should be in the inclusive range of 0 and ${MAX_SAFE_CHAIN_ID}. Received: ${chainId}`,
      }),
    };
  }

  const blockchains = await StorageUtil.getAllBlockChains();
  const existingChain = blockchains.find(
    (chain) => chain.chainId.toLowerCase() === chainId.toLowerCase(),
  );
  if (!existingChain) {
    return {
      canProceed: false,
      proceedError: providerErrors.custom({
        code: 4902,
        message: `Unrecognized chain ID "${chainId}". Try adding the chain using ${RESTRICTED_METHODS.WALLET_ADD_QRL_CHAIN} first.`,
      }),
    };
  }

  return {
    canProceed: true,
    proceedError: undefined,
  };
};

export const checkWalletWatchAssetParams = async (paramObject: {
  type: string;
  options: {
    address: string;
    symbol: string;
    decimals: number;
    image: string;
  };
}) => {
  if (!paramObject || typeof paramObject !== "object") {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: `Expected single, object parameter. Received: ${JSON.stringify(
          paramObject,
        )}`,
      }),
    };
  }

  if (!paramObject?.type || paramObject?.type?.toLowerCase() !== "zrc20") {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: "Asset type should be ZRC20.",
      }),
    };
  }

  if (
    !paramObject?.options?.address ||
    !paramObject?.options?.decimals ||
    !paramObject?.options?.symbol
  ) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: "Must specify address, symbol, and decimals.",
      }),
    };
  }

  if (typeof paramObject?.options?.symbol !== "string") {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: "Invalid symbol: not a string.",
      }),
    };
  }

  if (paramObject?.options?.symbol?.length > 11) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: "Invalid symbol '${symbol}': longer than 11 characters.",
      }),
    };
  }

  if (
    paramObject?.options?.decimals < 0 ||
    paramObject?.options?.decimals > 36
  ) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams({
        message: "Invalid decimals '${decimals}': must be 0 <= 36.",
      }),
    };
  }

  return {
    canProceed: true,
    proceedError: undefined,
  };
};

export const checkWalletRequestPermissionParams = async (paramObject: {
  [k: string]: unknown;
}) => {
  const isAnObject =
    Boolean(paramObject) &&
    typeof paramObject === "object" &&
    !Array.isArray(paramObject);
  if (!isAnObject) {
    return {
      canProceed: false,
      proceedError: rpcErrors.invalidParams(),
    };
  }
  const allowedCapabilities: string[] = Object.values(PARENT_CAPABILITIES);
  const requestedCapability = Object.keys(paramObject)?.[0] ?? "";
  if (!allowedCapabilities.includes(requestedCapability)) {
    return {
      canProceed: false,
      proceedError: rpcErrors.methodNotFound({
        message: `The method "${requestedCapability}" does not exist / is not available.`,
      }),
    };
  }

  return {
    canProceed: true,
    proceedError: undefined,
  };
};

export const updateAccountsAndBlockchainsForUrlOrigin = async ({
  urlOrigin,
  accounts,
  blockchains,
}: {
  urlOrigin: string;
  accounts: string[];
  blockchains: BlockchainDataType[];
}) => {
  const origin = new URL(urlOrigin ?? "").origin;
  // Do not silently force-switch the globally-active chain when granting
  // permissions. The user approved the connect, not a chain change. If the
  // dApp needs a different chain, it can call wallet_switchQRLChain — which
  // will surface to the user via the popup (F-3).
  const blockchainIds = blockchains.map((blockchain) => blockchain.chainId);
  const permissions: Permission[] = [
    {
      invoker: origin,
      parentCapability: PARENT_CAPABILITIES.QRL_ACCOUNTS,
      caveats: [
        {
          type: CAVEAT_TYPES.RESTRICT_RETURNED_ACCOUNTS,
          value: [...accounts],
        },
      ],
    },
    {
      invoker: origin,
      parentCapability: PARENT_CAPABILITIES.QRL_CHAINS,
      caveats: [
        {
          type: CAVEAT_TYPES.RESTRICT_NETWORK_SWITCHING,
          value: [...blockchainIds],
        },
      ],
    },
  ];
  await StorageUtil.setDAppsConnectedAccountsData({
    urlOrigin: origin,
    accounts: [...accounts],
    blockchains: [...blockchains],
    permissions,
  });
  return accounts;
};

export const includeChainForUrlOrigin = async ({
  urlOrigin,
  chainId,
}: {
  urlOrigin: string;
  chainId: string;
}) => {
  const origin = new URL(urlOrigin ?? "").origin;
  const dAppConnectedData =
    await StorageUtil.getDAppsConnectedAccountsData(origin);
  const allBlockchains = await StorageUtil.getAllBlockChains();
  const blockchain = allBlockchains.find(
    (chain) => chain?.chainId?.toLowerCase() === chainId?.toLowerCase(),
  );
  const isAdditionRequired = !(dAppConnectedData?.blockchains ?? []).find(
    (chain) =>
      chain.chainId?.toLowerCase() === blockchain?.chainId?.toLowerCase(),
  );
  const updatedBlockchains = [
    ...(dAppConnectedData?.blockchains ?? []),
    ...(isAdditionRequired && blockchain ? [blockchain] : []),
  ];

  await updateAccountsAndBlockchainsForUrlOrigin({
    urlOrigin: origin,
    accounts: dAppConnectedData?.accounts ?? [],
    blockchains: updatedBlockchains,
  });
};

export const excludeChainForUrlOrigin = async ({
  urlOrigin,
  chainId,
}: {
  urlOrigin: string;
  chainId: string;
}) => {
  const origin = new URL(urlOrigin ?? "").origin;
  const dAppConnectedData =
    await StorageUtil.getDAppsConnectedAccountsData(origin);
  const updatedBlockchains =
    dAppConnectedData?.blockchains?.filter(
      (chain) => chain?.chainId?.toLowerCase() !== chainId.toLowerCase(),
    ) ?? [];

  await updateAccountsAndBlockchainsForUrlOrigin({
    urlOrigin: origin,
    accounts: dAppConnectedData?.accounts ?? [],
    blockchains: updatedBlockchains,
  });
};
