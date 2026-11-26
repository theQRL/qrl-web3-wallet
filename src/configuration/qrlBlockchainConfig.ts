const QRL_MAINNET_DATA = {
  chainId: "0x1",
  chainName: "QRL 2.0 Mainnet",
  rpcUrls: ["http://127.0.0.1:8545"],
  blockExplorerUrls: ["https://www.theqrl.org/markets/"],
  nativeCurrency: {
    name: "Quanta",
    symbol: "QRL",
    decimals: 18,
  },
  iconUrls: ["icons/chains/zond_mainnet.svg"],
};

const QRL_TESTNET_DATA = {
  chainId: "0x539",
  chainName: "QRL 2.0 Testnet",
  rpcUrls: ["http://209.250.255.226:8545"],
  blockExplorerUrls: ["https://www.theqrl.org/markets/"],
  nativeCurrency: {
    name: "Quanta",
    symbol: "QRL",
    decimals: 18,
  },
  iconUrls: ["icons/chains/zond_testnet.svg"],
};

export type BlockchainBaseDataType = typeof QRL_MAINNET_DATA;

export type BlockchainAdditionalDataType = {
  defaultRpcUrl: string;
  defaultBlockExplorerUrl: string;
  defaultIconUrl: string;
  isTestnet: boolean;
  defaultWsRpcUrl?: string;
  isCustomChain: boolean;
  qrnsRegistryAddress?: string;
};

export type BlockchainDataType = BlockchainBaseDataType &
  BlockchainAdditionalDataType;

export const QRL_BLOCKCHAINS: BlockchainDataType[] = [
  {
    ...QRL_MAINNET_DATA,
    defaultRpcUrl: QRL_MAINNET_DATA.rpcUrls[0],
    defaultBlockExplorerUrl: QRL_MAINNET_DATA.blockExplorerUrls[0],
    defaultIconUrl: QRL_MAINNET_DATA.iconUrls[0],
    isTestnet: false,
    isCustomChain: false,
  },
  {
    ...QRL_TESTNET_DATA,
    defaultRpcUrl: QRL_TESTNET_DATA.rpcUrls[0],
    defaultBlockExplorerUrl: QRL_TESTNET_DATA.blockExplorerUrls[0],
    defaultIconUrl: QRL_TESTNET_DATA.iconUrls[0],
    isTestnet: true,
    isCustomChain: false,
  },
];

export const DEFAULT_BLOCKCHAIN = QRL_BLOCKCHAINS[1]; // Testnet

// Earlier builds wrote these placeholders into saved chains automatically.
export const getSubscriptionRpcUrl = (url?: string): string | undefined => {
  const endpoint = url?.trim().replace(/\/+$/, "");
  return endpoint === "http://localhost:3000" ||
    endpoint === "http://127.0.0.1:8545"
    ? undefined
    : endpoint || undefined;
};
