import { BlockchainDataType } from "@/configuration/qrlBlockchainConfig";
import { AdditionalJsonRpcRequestKeys } from "@theqrl/qrl-wallet-provider/utils";

export type PhishingDetectorStatus = "ready" | "initializing" | "unavailable";

export type PhishingCheckResult = {
  isDomainPhishing: boolean;
  matchType?: string;
  matchedDomain?: string;
  detectorStatus?: PhishingDetectorStatus;
};

export type DAppRequestType = {
  method: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
  requestData?: AdditionalJsonRpcRequestKeys;
  phishingResult?: PhishingCheckResult;
  // UUID minted by the middleware when the request enters the approval flow;
  // the popup must echo it on the DAPP_RESPONSE so a stale response cannot
  // satisfy a different pending request.
  requestId?: string;
};

export type DAppResponseType = {
  method: string;
  action: string;
  hasApproved: boolean;
  // Echo of DAppRequestType.requestId. Required for the middleware to accept
  // the response.
  requestId?: string;
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
