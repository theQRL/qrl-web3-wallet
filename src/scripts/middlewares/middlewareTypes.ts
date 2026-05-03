import { BlockchainDataType } from "@/configuration/qrlBlockchainConfig";
import { AdditionalJsonRpcRequestKeys } from "@theqrl/qrl-wallet-provider/utils";

export type PhishingCheckResult = {
  isDomainPhishing: boolean;
  matchType?: string;
  matchedDomain?: string;
};

export type DAppRequestType = {
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
  requestData?: AdditionalJsonRpcRequestKeys;
  phishingResult?: PhishingCheckResult;
};

export type DAppResponseType = {
  method: string;
  action: string;
  hasApproved: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response?: any;
};

export const CAVEAT_TYPES = Object.freeze({
  RESTRICT_RETURNED_ACCOUNTS: "restrictReturnedAccounts",
  RESTRICT_NETWORK_SWITCHING: "restrictNetworkSwitching",
});

type CaveatsTypeType = (typeof CAVEAT_TYPES)[keyof typeof CAVEAT_TYPES];

type Caveat = {
  type: CaveatsTypeType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
};

export const PARENT_CAPABILITIES = Object.freeze({
  QRL_ACCOUNTS: "qrl_accounts",
  QRL_CHAINS: "qrl_chains",
});

type ParentCapabilityType =
  (typeof PARENT_CAPABILITIES)[keyof typeof PARENT_CAPABILITIES];

export type Permission = {
  invoker: string;
  parentCapability: ParentCapabilityType;
  caveats: Caveat[];
};

export type ConnectedAccountsDataType = {
  urlOrigin: string;
  accounts: string[];
  blockchains: BlockchainDataType[];
  permissions: Permission[];
};

export type TokenContractType = {
  address: string;
  symbol: string;
  decimals: number;
  image: string;
};
