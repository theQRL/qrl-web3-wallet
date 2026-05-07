import {
  BlockchainDataType,
  DEFAULT_BLOCKCHAIN,
} from "@/configuration/qrlBlockchainConfig";
import { NATIVE_TOKEN_UNITS_OF_GAS } from "@/constants/nativeToken";
import {
  ZRC_721_CONTRACT_ABI,
  ERC_721_INTERFACE_ID,
  ERC_721_ENUMERABLE_INTERFACE_ID,
  NFT_UNITS_OF_GAS,
} from "@/constants/nftToken";
import {
  ZRC_20_CONTRACT_ABI,
  ZRC_20_TOKEN_UNITS_OF_GAS,
} from "@/constants/zrc20Token";
import { getHexSeedFromMnemonic } from "@/functions/getHexSeedFromMnemonic";
import { getOptimalTokenBalance } from "@/functions/getOptimalTokenBalance";
import type { GasFeeOverrides } from "@/types/gasFee";
import type { TransactionHistoryEntry } from "@/types/transactionHistory";
import StorageUtil from "@/utilities/storageUtil";
import Web3, {
  Web3QRLInterface,
  utils,
} from "@theqrl/web3";
import { action, makeAutoObservable, observable, runInAction } from "mobx";

type ActiveAccountType = {
  accountAddress: string;
};

type QrlAccountType = {
  accountAddress: string;
  accountBalance: string;
};

type QrlAccountsType = {
  accounts: QrlAccountType[];
  isLoading: boolean;
};

class QrlStore {
  qrlInstance?: Web3QRLInterface;
  qrlConnection = {
    isConnected: false,
    isLoading: false,
    blockchain: DEFAULT_BLOCKCHAIN,
  };
  qrlAccounts: QrlAccountsType = { accounts: [], isLoading: false };
  activeAccount: ActiveAccountType = { accountAddress: "" };

  constructor() {
    makeAutoObservable(this, {
      initializeBlockchain: action.bound,
      qrlInstance: observable.struct,
      qrlConnection: observable.struct,
      qrlAccounts: observable.struct,
      activeAccount: observable.struct,
      refreshBlockchainData: action.bound,
      selectBlockchain: action.bound,
      setActiveAccount: action.bound,
      fetchQrlConnection: action.bound,
      fetchAccounts: action.bound,
      getGasFeeData: action.bound,
      getAccountBalance: action.bound,
      getNativeTokenGas: action.bound,
      signNativeToken: action.bound,
      getZrc20TokenDetails: action.bound,
      getZrc20TokenGas: action.bound,
      signZrc20Token: action.bound,
      signAndSendReplacementTransaction: action.bound,
      getTransactionReceipt: action.bound,
      sendRawTransaction: action.bound,
      getNftCollectionDetails: action.bound,
      getOwnedNftTokenIds: action.bound,
      getNftTokenUri: action.bound,
      getNftTransferGas: action.bound,
      signNftTransfer: action.bound,
    });
    this.initializeBlockchain();
  }

  async initializeBlockchain() {
    await this.refreshBlockchainData();
    const qrlHttpProvider = new Web3.providers.HttpProvider(
      this.qrlConnection.blockchain.defaultRpcUrl || "http://localhost",
    );
    const { qrl } = new Web3({ provider: qrlHttpProvider });
    this.qrlInstance = qrl;

    await this.fetchQrlConnection();
    await this.fetchAccounts();
    await this.validateActiveAccount();
  }

  async addChain(chainData: BlockchainDataType) {
    const newChain: BlockchainDataType = {
      ...chainData,
      chainId: chainData?.chainId?.trim(),
      chainName: chainData?.chainName?.trim()?.substring(0, 100),
    };
    const blockchains = await StorageUtil.getAllBlockChains();
    const chainFound = !!blockchains.find(
      (chain) => chain.chainId.toLowerCase() === newChain.chainId.toLowerCase(),
    );
    return { chainFound, updatedChainList: [...blockchains, newChain] };
  }

  async editChain(chainData: BlockchainDataType) {
    const editedChain = {
      ...chainData,
      chainId: chainData?.chainId?.trim(),
      chainName: chainData?.chainName?.trim()?.substring(0, 100),
    };
    const blockchains = await StorageUtil.getAllBlockChains();
    const updatedChainList: BlockchainDataType[] = blockchains.map((chain) =>
      chain.chainId.toLowerCase() === editedChain?.chainId?.toLowerCase()
        ? { ...chain, ...editedChain }
        : chain,
    );
    return { updatedChainList };
  }

  async refreshBlockchainData() {
    const blockchain = await StorageUtil.getActiveBlockChain();
    this.qrlConnection = { ...this.qrlConnection, blockchain };
  }

  async selectBlockchain(chainId: string) {
    await StorageUtil.setActiveBlockChain(chainId);
    await this.initializeBlockchain();
  }

  async setActiveAccount(activeAccount?: string) {
    await StorageUtil.setActiveAccount(activeAccount);
    this.activeAccount = {
      ...this.activeAccount,
      accountAddress: activeAccount ?? "",
    };

    let storedAccountList: string[] = [];
    try {
      const accountListFromStorage = await StorageUtil.getAllAccounts();
      storedAccountList = [...accountListFromStorage];
      if (activeAccount) {
        storedAccountList.push(activeAccount);
      }
      storedAccountList = [...new Set(storedAccountList)];
    } finally {
      await StorageUtil.setAllAccounts(storedAccountList);
      await this.fetchAccounts();
    }
  }

  async fetchQrlConnection() {
    this.qrlConnection = { ...this.qrlConnection, isLoading: true };
    try {
      const isListening = (await this.qrlInstance?.net.isListening()) ?? false;
      runInAction(() => {
        this.qrlConnection = {
          ...this.qrlConnection,
          isConnected: isListening,
        };
      });
    } catch {
      runInAction(() => {
        this.qrlConnection = { ...this.qrlConnection, isConnected: false };
      });
    } finally {
      runInAction(() => {
        this.qrlConnection = { ...this.qrlConnection, isLoading: false };
      });
    }
  }

  async fetchAccounts() {
    this.qrlAccounts = { ...this.qrlAccounts, isLoading: true };

    let storedAccountsList: string[] = [];
    const accountListFromStorage = await StorageUtil.getAllAccounts();
    storedAccountsList = accountListFromStorage;
    try {
      const accountsWithBalance: QrlAccountsType["accounts"] =
        await Promise.all(
          storedAccountsList.map(async (account) => {
            const accountBalance =
              (await this.qrlInstance?.getBalance(account)) ?? BigInt(0);
            const convertedAccountBalance = getOptimalTokenBalance(
              utils.fromPlanck(accountBalance, "quanta"),
            );
            return {
              accountAddress: account,
              accountBalance: convertedAccountBalance,
            };
          }),
        );
      runInAction(() => {
        this.qrlAccounts = {
          ...this.qrlAccounts,
          accounts: accountsWithBalance,
        };
      });
    } catch {
      runInAction(() => {
        this.qrlAccounts = {
          ...this.qrlAccounts,
          accounts: storedAccountsList.map((account) => ({
            accountAddress: account,
            accountBalance: "0.0 QRL",
          })),
        };
      });
    } finally {
      runInAction(() => {
        this.qrlAccounts = { ...this.qrlAccounts, isLoading: false };
      });
    }
  }

  async validateActiveAccount() {
    this.activeAccount = { accountAddress: "" };
    const storedActiveAccount = await StorageUtil.getActiveAccount();

    const confirmedExistingActiveAccount =
      this.qrlAccounts.accounts.find(
        (account) => account.accountAddress === storedActiveAccount,
      )?.accountAddress ?? "";
    if (!confirmedExistingActiveAccount) {
      await StorageUtil.clearActiveAccount();
    }
    runInAction(() => {
      this.activeAccount = {
        ...this.activeAccount,
        accountAddress: confirmedExistingActiveAccount,
      };
    });
  }

  private async getBaseTip(): Promise<bigint> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tip = await (this.qrlInstance as any)?.requestManager?.send({
        method: "qrl_maxPriorityFeePerGas",
        params: [],
      });
      const parsed = BigInt(tip);
      if (parsed > BigInt(0)) return parsed;
    } catch {
      // RPC method not supported — fall back to default
    }
    return BigInt(utils.toPlanck("2", "shor"));
  }

  async getGasFeeData(overrides?: GasFeeOverrides) {
    const latestBlock = await this.qrlInstance?.getBlock("latest");
    const baseFeePerGas = latestBlock?.baseFeePerGas ?? BigInt(0);

    if (overrides?.tier === "advanced") {
      const maxPriorityFeePerGas =
        overrides.maxPriorityFeePerGas ?? BigInt(0);
      const maxFeePerGas =
        overrides.maxFeePerGas ?? baseFeePerGas + maxPriorityFeePerGas;
      return { baseFeePerGas, maxPriorityFeePerGas, maxFeePerGas };
    }

    const baseTip = await this.getBaseTip();
    let maxPriorityFeePerGas: bigint;

    switch (overrides?.tier) {
      case "low":
        maxPriorityFeePerGas = baseTip;
        break;
      case "aggressive":
        maxPriorityFeePerGas = baseTip * BigInt(2);
        break;
      case "market":
      default:
        // 1.5x — multiply by 3 then divide by 2, rounded up
        maxPriorityFeePerGas = (baseTip * BigInt(3) + BigInt(1)) / BigInt(2);
        break;
    }

    const maxFeePerGas = baseFeePerGas + maxPriorityFeePerGas;
    return { baseFeePerGas, maxPriorityFeePerGas, maxFeePerGas };
  }

  getAccountBalance(accountAddress: string) {
    return (
      this.qrlAccounts.accounts.find(
        (account) => account.accountAddress === accountAddress,
      )?.accountBalance ?? "0.0 QRL"
    );
  }

  async getNativeTokenGas(overrides?: GasFeeOverrides) {
    const gasLimit =
      overrides?.tier === "advanced" && overrides.gasLimit
        ? overrides.gasLimit
        : NATIVE_TOKEN_UNITS_OF_GAS;
    const { baseFeePerGas, maxPriorityFeePerGas } =
      await this.getGasFeeData(overrides);
    return utils.fromPlanck(
      BigInt(gasLimit) * (baseFeePerGas + maxPriorityFeePerGas),
      "quanta",
    );
  }

  async signNativeToken(
    from: string,
    to: string,
    value: number,
    mnemonicPhrases: string,
    overrides?: GasFeeOverrides,
  ) {
    let result: {
      transactionHash?: string;
      rawTransaction?: string;
      error: string;
      nonce?: number;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      gasLimit?: number;
    } = { error: "" };

    try {
      const { maxFeePerGas, maxPriorityFeePerGas } =
        await this.getGasFeeData(overrides);
      const gasLimit =
        overrides?.tier === "advanced" && overrides.gasLimit
          ? overrides.gasLimit
          : NATIVE_TOKEN_UNITS_OF_GAS;
      const nonce = await this.qrlInstance?.getTransactionCount(from);
      const transactionObject = {
        from,
        to,
        value: utils.toPlanck(value, "quanta"),
        nonce,
        gasLimit,
        maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
        maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
        type: 2,
      };
      const signedTransaction =
        await this.qrlInstance?.accounts.signTransaction(
          transactionObject,
          getHexSeedFromMnemonic(mnemonicPhrases),
        );
      if (signedTransaction) {
        result = {
          transactionHash: signedTransaction.transactionHash?.toString(),
          rawTransaction: signedTransaction.rawTransaction?.toString(),
          error: "",
          nonce: Number(nonce),
          maxFeePerGas: maxFeePerGas.toString(),
          maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
          gasLimit,
        };
      } else {
        throw new Error("Transaction could not be signed");
      }
    } catch (error) {
      result = {
        ...result,
        error: `Transaction could not be signed. ${error}`,
      };
    }

    return result;
  }

  async getZrc20TokenDetails(contractAddress: string) {
    const tokenDetails = {
      token: undefined,
      error: "",
    };

    const contractAbi = ZRC_20_CONTRACT_ABI;

    if (this.qrlInstance && this.qrlInstance.Contract) {
      try {
        const contract = new this.qrlInstance.Contract(
          contractAbi,
          contractAddress,
        );
        const name = (await contract.methods.name().call()) as string;
        const symbol = (await contract.methods.symbol().call()) as string;
        const decimals = (await contract.methods.decimals().call()) as bigint;
        const totalSupplyUnformatted = (await contract.methods
          .totalSupply()
          .call()) as bigint;
        const totalSupply =
          Number(totalSupplyUnformatted) / Math.pow(10, Number(decimals));
        const balanceUnformatted = (await contract.methods
          .balanceOf(this.activeAccount.accountAddress)
          .call()) as bigint;
        const balance =
          Number(balanceUnformatted) / Math.pow(10, Number(decimals));
        return {
          ...tokenDetails,
          token: { name, symbol, decimals, totalSupply, balance, image: "" },
        };
      } catch {
        return {
          ...tokenDetails,
          error:
            "Could not retreive the token with the entered contract address",
        };
      }
    }

    return tokenDetails;
  }

  async getNftCollectionDetails(contractAddress: string) {
    const result: {
      collection?: { name: string; symbol: string; balance: number };
      error: string;
    } = { error: "" };

    if (this.qrlInstance && this.qrlInstance.Contract) {
      try {
        const contract = new this.qrlInstance.Contract(
          ZRC_721_CONTRACT_ABI,
          contractAddress,
        );

        // Verify it supports ERC-721 interface
        const isErc721 = (await contract.methods
          .supportsInterface(ERC_721_INTERFACE_ID)
          .call()) as boolean;

        if (!isErc721) {
          return { ...result, error: "Contract does not support ZRC-721" };
        }

        const name = (await contract.methods.name().call()) as string;
        const symbol = (await contract.methods.symbol().call()) as string;
        const balance = Number(
          (await contract.methods
            .balanceOf(this.activeAccount.accountAddress)
            .call()) as bigint,
        );

        return { ...result, collection: { name, symbol, balance } };
      } catch {
        return {
          ...result,
          error:
            "Could not retrieve the NFT collection with the entered contract address",
        };
      }
    }

    return result;
  }

  async getOwnedNftTokenIds(contractAddress: string) {
    const tokenIds: string[] = [];

    if (this.qrlInstance && this.qrlInstance.Contract) {
      try {
        const contract = new this.qrlInstance.Contract(
          ZRC_721_CONTRACT_ABI,
          contractAddress,
        );

        const balance = Number(
          (await contract.methods
            .balanceOf(this.activeAccount.accountAddress)
            .call()) as bigint,
        );

        // Check if contract supports Enumerable extension
        let isEnumerable = false;
        try {
          isEnumerable = (await contract.methods
            .supportsInterface(ERC_721_ENUMERABLE_INTERFACE_ID)
            .call()) as boolean;
        } catch {
          isEnumerable = false;
        }

        if (isEnumerable) {
          for (let i = 0; i < balance; i++) {
            const tokenId = (await contract.methods
              .tokenOfOwnerByIndex(this.activeAccount.accountAddress, i)
              .call()) as bigint;
            tokenIds.push(tokenId.toString());
          }
        }
      } catch {
        // Silently fail — return empty array
      }
    }

    return tokenIds;
  }

  async getNftTokenUri(contractAddress: string, tokenId: string) {
    if (this.qrlInstance && this.qrlInstance.Contract) {
      try {
        const contract = new this.qrlInstance.Contract(
          ZRC_721_CONTRACT_ABI,
          contractAddress,
        );
        const uri = (await contract.methods
          .tokenURI(tokenId)
          .call()) as string;
        return uri;
      } catch {
        return "";
      }
    }
    return "";
  }

  async getNftTransferGas(
    from: string,
    to: string,
    tokenId: string,
    contractAddress: string,
    overrides?: GasFeeOverrides,
  ) {
    if (this.qrlInstance && this.qrlInstance.Contract) {
      try {
        const contract = new this.qrlInstance.Contract(
          ZRC_721_CONTRACT_ABI,
          contractAddress,
        );
        const transferCall = contract.methods.safeTransferFrom(
          from,
          to,
          BigInt(tokenId),
        );
        const estimatedGasLimit = Number(
          await transferCall.estimateGas({ from }),
        );
        const gasLimit =
          overrides?.tier === "advanced" && overrides.gasLimit
            ? overrides.gasLimit
            : estimatedGasLimit;
        const { baseFeePerGas, maxPriorityFeePerGas } =
          await this.getGasFeeData(overrides);
        return utils.fromPlanck(
          BigInt(gasLimit) * (baseFeePerGas + maxPriorityFeePerGas),
          "quanta",
        );
      } catch {
        return "";
      }
    }
    return "";
  }

  async signNftTransfer(
    from: string,
    to: string,
    tokenId: string,
    mnemonicPhrases: string,
    contractAddress: string,
    overrides?: GasFeeOverrides,
  ) {
    let result: {
      transactionHash?: string;
      rawTransaction?: string;
      error: string;
      nonce?: number;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      gasLimit?: number;
      data?: string;
    } = { error: "" };

    if (this.qrlInstance && this.qrlInstance.Contract) {
      try {
        const contract = new this.qrlInstance.Contract(
          ZRC_721_CONTRACT_ABI,
          contractAddress,
        );
        const transferCall = contract.methods.safeTransferFrom(
          from,
          to,
          BigInt(tokenId),
        );
        // Run all RPC calls in parallel for speed
        const useAdvancedGas =
          overrides?.tier === "advanced" && overrides.gasLimit;
        const [gasFeeData, estimatedGasResult, nonce] = await Promise.all([
          this.getGasFeeData(overrides),
          useAdvancedGas
            ? Promise.resolve(null)
            : transferCall
                .estimateGas({ from })
                .catch(() => null),
          this.qrlInstance?.getTransactionCount(from),
        ]);
        const { maxFeePerGas, maxPriorityFeePerGas } = gasFeeData;
        let gasLimit = useAdvancedGas
          ? overrides!.gasLimit!
          : NFT_UNITS_OF_GAS;
        if (estimatedGasResult !== null && estimatedGasResult !== undefined) {
          // Add 20% buffer to estimated gas
          gasLimit = Math.ceil(Number(estimatedGasResult) * 1.2);
        }
        const encodedData = transferCall.encodeABI();
        const transactionObject = {
          from,
          to: contractAddress,
          data: encodedData,
          nonce,
          gasLimit,
          maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
          maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
          type: 2,
        };

        console.log("[signNftTransfer] Signing TX:", { from, to, tokenId, contractAddress, nonce, gasLimit });

        const signedTransaction =
          await this.qrlInstance?.accounts.signTransaction(
            transactionObject,
            getHexSeedFromMnemonic(mnemonicPhrases),
          );

        if (signedTransaction) {
          result = {
            transactionHash: signedTransaction.transactionHash?.toString(),
            rawTransaction: signedTransaction.rawTransaction?.toString(),
            error: "",
            nonce: Number(nonce),
            maxFeePerGas: maxFeePerGas.toString(),
            maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
            gasLimit,
            data: encodedData,
          };
        } else {
          throw new Error("Transaction could not be signed");
        }
      } catch (error) {
        console.error("[signNftTransfer] Error:", error);
        result = {
          ...result,
          error: `Transaction could not be signed. ${error}`,
        };
      }
    } else {
      console.error("[signNftTransfer] qrlInstance not available");
      result = { ...result, error: "Blockchain connection not available" };
    }

    return result;
  }

  async getZrc20TokenGas(
    from: string,
    to: string,
    value: number,
    contractAddress: string,
    decimals: number,
    overrides?: GasFeeOverrides,
  ) {
    if (this.qrlInstance && this.qrlInstance.Contract) {
      const contract = new this.qrlInstance.Contract(
        ZRC_20_CONTRACT_ABI,
        contractAddress,
      );
      const contractTransfer = contract.methods.transfer(
        to,
        BigInt(value * 10 ** decimals),
      );
      const estimatedGasLimit = Number(
        await contractTransfer.estimateGas({ from }),
      );
      const gasLimit =
        overrides?.tier === "advanced" && overrides.gasLimit
          ? overrides.gasLimit
          : estimatedGasLimit;
      const { baseFeePerGas, maxPriorityFeePerGas } =
        await this.getGasFeeData(overrides);
      return utils.fromPlanck(
        BigInt(gasLimit) * (baseFeePerGas + maxPriorityFeePerGas),
        "quanta",
      );
    }
    return "";
  }

  async signZrc20Token(
    from: string,
    to: string,
    value: number,
    mnemonicPhrases: string,
    contractAddress: string,
    decimals: number,
    overrides?: GasFeeOverrides,
  ) {
    let result: {
      transactionHash?: string;
      rawTransaction?: string;
      error: string;
      nonce?: number;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      gasLimit?: number;
      data?: string;
    } = { error: "" };

    const contractAbi = ZRC_20_CONTRACT_ABI;

    if (this.qrlInstance && this.qrlInstance.Contract) {
      try {
        const contract = new this.qrlInstance.Contract(
          contractAbi,
          contractAddress,
        );
        const contractTransfer = contract.methods.transfer(
          to,
          BigInt(value * 10 ** decimals),
        );
        const { maxFeePerGas, maxPriorityFeePerGas } =
          await this.getGasFeeData(overrides);
        const gasLimit =
          overrides?.tier === "advanced" && overrides.gasLimit
            ? overrides.gasLimit
            : ZRC_20_TOKEN_UNITS_OF_GAS;
        const nonce = await this.qrlInstance?.getTransactionCount(from);
        const encodedData = contractTransfer.encodeABI();
        const transactionObject = {
          from,
          to: contractAddress,
          data: encodedData,
          nonce,
          gasLimit,
          maxFeePerGas: `0x${maxFeePerGas.toString(16)}`,
          maxPriorityFeePerGas: `0x${maxPriorityFeePerGas.toString(16)}`,
          type: 2,
        };

        const signedTransaction =
          await this.qrlInstance?.accounts.signTransaction(
            transactionObject,
            getHexSeedFromMnemonic(mnemonicPhrases),
          );

        if (signedTransaction) {
          result = {
            transactionHash: signedTransaction.transactionHash?.toString(),
            rawTransaction: signedTransaction.rawTransaction?.toString(),
            error: "",
            nonce: Number(nonce),
            maxFeePerGas: maxFeePerGas.toString(),
            maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
            gasLimit,
            data: encodedData,
          };
        } else {
          throw new Error("Transaction could not be signed");
        }
      } catch (error) {
        result = {
          ...result,
          error: `Transaction could not be signed. ${error}`,
        };
      }
    }

    return result;
  }
  async signAndSendReplacementTransaction(
    originalTx: TransactionHistoryEntry,
    replacementAction: "speed-up" | "cancel",
    mnemonicPhrases: string,
    overrides?: GasFeeOverrides,
  ) {
    let result: {
      transactionHash?: string;
      rawTransaction?: string;
      error: string;
    } = { error: "" };

    try {
      const tier = overrides?.tier ?? "aggressive";
      const { maxFeePerGas: newMaxFee, maxPriorityFeePerGas: newPriorityFee } =
        await this.getGasFeeData({ ...overrides, tier });

      // Enforce ≥10% bump over original
      const origMaxFee = BigInt(originalTx.maxFeePerGas ?? "0");
      const origPriorityFee = BigInt(originalTx.maxPriorityFeePerGas ?? "0");
      const minBumpedMaxFee =
        origMaxFee + (origMaxFee * BigInt(10)) / BigInt(100);
      const minBumpedPriorityFee =
        origPriorityFee + (origPriorityFee * BigInt(10)) / BigInt(100);

      const finalMaxFee =
        newMaxFee > minBumpedMaxFee ? newMaxFee : minBumpedMaxFee;
      const finalPriorityFee =
        newPriorityFee > minBumpedPriorityFee
          ? newPriorityFee
          : minBumpedPriorityFee;

      const nonce = originalTx.nonce;
      if (nonce === undefined) {
        throw new Error("Original transaction nonce is not available");
      }

      let transactionObject;
      if (replacementAction === "cancel") {
        transactionObject = {
          from: originalTx.from,
          to: originalTx.from,
          value: "0",
          nonce,
          gasLimit: NATIVE_TOKEN_UNITS_OF_GAS,
          maxFeePerGas: `0x${finalMaxFee.toString(16)}`,
          maxPriorityFeePerGas: `0x${finalPriorityFee.toString(16)}`,
          type: 2,
        };
      } else {
        transactionObject = {
          from: originalTx.from,
          to: originalTx.isZrc20Token
            ? originalTx.tokenContractAddress
            : originalTx.to,
          value: originalTx.isZrc20Token
            ? "0"
            : utils.toPlanck(originalTx.amount, "quanta"),
          nonce,
          gasLimit:
            originalTx.gasLimit ??
            (originalTx.isZrc20Token
              ? ZRC_20_TOKEN_UNITS_OF_GAS
              : NATIVE_TOKEN_UNITS_OF_GAS),
          maxFeePerGas: `0x${finalMaxFee.toString(16)}`,
          maxPriorityFeePerGas: `0x${finalPriorityFee.toString(16)}`,
          type: 2,
          ...(originalTx.data && { data: originalTx.data }),
        };
      }

      const signedTransaction =
        await this.qrlInstance?.accounts.signTransaction(
          transactionObject,
          getHexSeedFromMnemonic(mnemonicPhrases),
        );

      if (!signedTransaction) {
        throw new Error("Replacement transaction could not be signed");
      }

      result = {
        transactionHash: signedTransaction.transactionHash?.toString(),
        rawTransaction: signedTransaction.rawTransaction?.toString(),
        error: "",
      };
    } catch (error) {
      result = { error: `Replacement transaction failed. ${error}` };
    }

    return result;
  }

  async getTransactionReceipt(txHash: string) {
    return await this.qrlInstance?.getTransactionReceipt(txHash);
  }

  async sendRawTransaction(rawTransaction: string) {
    const receipt =
      await this.qrlInstance?.sendSignedTransaction(rawTransaction);
    return receipt;
  }
}

export default QrlStore;
