export type PendingStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "replaced"
  | "cancelled"
  | "dropped";

export type TransactionHistoryEntry = {
  id: string;
  from: string;
  to: string;
  amount: number;
  tokenSymbol: string;
  tokenName: string;
  isZrc20Token: boolean;
  tokenContractAddress: string;
  tokenDecimals: number;
  transactionHash: string;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
  status: boolean;
  timestamp: number;
  chainId: string;
  // Pending transaction support (all optional for backward compat)
  pendingStatus?: PendingStatus;
  nonce?: number;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasLimit?: number;
  data?: string;
  errorMessage?: string;
  replacementTransactionHash?: string;
  replacedByAction?: "speed-up" | "cancel";
};

export type TokenFilter = "all" | "native" | "zrc20" | "nft";
