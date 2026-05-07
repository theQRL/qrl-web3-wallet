// List of methods that can be called by the dApp without user interaction
export const UNRESTRICTED_METHODS = Object.freeze({
  NET_VERSION: "net_version",
  WALLET_GET_PERMISSIONS: "wallet_getPermissions",
  WALLET_REVOKE_PERMISSIONS: "wallet_revokePermissions",
  WEB_3_CLIENT_VERSION: "web3_clientVersion",
  QRL_ACCOUNTS: "qrl_accounts",
  QRL_BLOCK_NUMBER: "qrl_blockNumber",
  QRL_CALL: "qrl_call",
  QRL_CHAIN_ID: "qrl_chainId",
  QRL_ESTIMATE_GAS: "qrl_estimateGas",
  QRL_FEE_HISTORY: "qrl_feeHistory",
  QRL_GAS_PRICE: "qrl_gasPrice",
  QRL_GET_BALANCE: "qrl_getBalance",
  QRL_GET_BLOCK_BY_HASH: "qrl_getBlockByHash",
  QRL_GET_BLOCK_BY_NUMBER: "qrl_getBlockByNumber",
  QRL_GET_BLOCK_TRANSACTION_COUNT_BY_HASH:
    "qrl_getBlockTransactionCountByHash",
  QRL_GET_BLOCK_TRANSACTION_COUNT_BY_NUMBER:
    "qrl_getBlockTransactionCountByNumber",
  QRL_GET_CODE: "qrl_getCode",
  QRL_GET_FILTER_CHANGES: "qrl_getFilterChanges",
  QRL_GET_FILTER_LOGS: "qrl_getFilterLogs",
  QRL_GET_LOGS: "qrl_getLogs",
  QRL_GET_PROOF: "qrl_getProof",
  QRL_GET_STORAGE_AT: "qrl_getStorageAt",
  QRL_GET_TRANSACTION_BY_BLOCK_HASH_AND_INDEX:
    "qrl_getTransactionByBlockHashAndIndex",
  QRL_GET_TRANSACTION_BY_BLOCK_NUMBER_AND_INDEX:
    "qrl_getTransactionByBlockNumberAndIndex",
  QRL_GET_TRANSACTION_BY_HASH: "qrl_getTransactionByHash",
  QRL_GET_TRANSACTION_COUNT: "qrl_getTransactionCount",
  QRL_GET_TRANSACTION_RECEIPT: "qrl_getTransactionReceipt",
  QRL_NEW_BLOCK_FILTER: "qrl_newBlockFilter",
  QRL_NEW_FILTER: "qrl_newFilter",
  QRL_NEW_PENDING_TRANSACTION_FILTER: "qrl_newPendingTransactionFilter",
  QRL_SEND_RAW_TRANSACTION: "qrl_sendRawTransaction",
  QRL_SUBSCRIBE: "qrl_subscribe",
  QRL_SYNCING: "qrl_syncing",
  QRL_UNINSTALL_FILTER: "qrl_uninstallFilter",
  QRL_UNSUBSCRIBE: "qrl_unsubscribe",
  QRL_WEB3_WALLET_GET_PROVIDER_STATE: "qrlWallet_getProviderState",
});

// List of methods that require user interaction (Approval/Rejection by the user)
export const RESTRICTED_METHODS = Object.freeze({
  PERSONAL_SIGN: "personal_sign",
  WALLET_ADD_QRL_CHAIN: "wallet_addQRLChain",
  WALLET_GET_CAPABILITIES: "wallet_getCapabilities",
  WALLET_REQUEST_PERMISSIONS: "wallet_requestPermissions",
  WALLET_SWITCH_QRL_CHAIN: "wallet_switchQRLChain",
  WALLET_WATCH_ASSET: "wallet_watchAsset",
  QRL_REQUEST_ACCOUNTS: "qrl_requestAccounts",
  QRL_SEND_TRANSACTION: "qrl_sendTransaction",
  QRL_SIGN_TYPED_DATA_V4: "qrl_signTypedData_v4",
});

export const ALL_REQUEST_METHODS = Object.values({
  ...RESTRICTED_METHODS,
  ...UNRESTRICTED_METHODS,
});
