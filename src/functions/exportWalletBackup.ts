import StorageUtil from "@/utilities/storageUtil";

const WALLET_VERSION = "0.1.1";

/**
 * Downloads the stored keystores, still encrypted, with the account list as a
 * JSON backup file. It reads storage only, so it works while the wallet is
 * locked and for a stored wallet this build does not open.
 */
export const exportWalletBackup = async () => {
  const keystores = await StorageUtil.getKeystores();
  const accounts = await StorageUtil.getAllAccounts();
  const activeChain = await StorageUtil.getActiveBlockChain();

  const backup = {
    version: WALLET_VERSION,
    exportedAt: new Date().toISOString(),
    keystores,
    accounts,
    activeChain: {
      chainId: activeChain.chainId,
      chainName: activeChain.chainName,
    },
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qrl-wallet-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
