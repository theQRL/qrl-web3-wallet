import { BlockchainDataType } from "@/configuration/qrlBlockchainConfig";
import { EXTENSION_MESSAGES } from "@/scripts/constants/streamConstants";
import {
  DAppRequestType,
  DAppResponseType,
} from "@/scripts/middlewares/middlewareTypes";
import { getSerializableObject } from "@/scripts/utils/scriptUtils";
import StorageUtil from "@/utilities/storageUtil";
import { action, makeAutoObservable, observable } from "mobx";
import browser from "webextension-polyfill";

type CurrentTabData = {
  favIconUrl: string;
  urlOrigin: string;
  title: string;
  connectedAccounts: string[];
  connectedBlockchains: BlockchainDataType[];
};

class DAppRequestStore {
  currentTabData?: CurrentTabData;
  dAppRequestData?: DAppRequestType;
  responseData: Record<string, unknown> = {};
  canProceed: boolean = false;
  onPermissionCallBack: (hasApproved: boolean) => Promise<void> = async () =>
    undefined;
  approvalProcessingStatus = {
    isProcessing: false,
    hasApproved: false,
    hasCompleted: false,
  };

  constructor() {
    makeAutoObservable(this, {
      dAppRequestData: observable.struct,
      responseData: observable.struct,
      readDAppRequestData: action.bound,
      addToResponseData: action.bound,
      setCanProceed: action.bound,
      setOnPermissionCallBack: action.bound,
      onPermission: action.bound,
      approvalProcessingStatus: observable.struct,
      fetchCurrentTabData: action.bound,
      disconnectFromCurrentTab: action.bound,
    });
    this.fetchCurrentTabData();
    this.subscribeToRequestStorage();
  }

  private subscribeToRequestStorage() {
    // The side panel persists across dApp interactions, so when the
    // middleware writes a new request to session storage we need to
    // re-read it; without this the panel renders stale data from the
    // previous request.
    try {
      browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "session" && "DAPPS" in changes) {
          this.responseData = {};
          this.approvalProcessingStatus = {
            isProcessing: false,
            hasApproved: false,
            hasCompleted: false,
          };
          void this.readDAppRequestData();
        }
      });
    } catch {
      // storage.onChanged unavailable — popup-only contexts work fine
      // without it because the popup is recreated on each open.
    }
  }

  get hasDAppRequest() {
    return !!this.dAppRequestData;
  }

  get hasDAppConnected() {
    return !!this?.currentTabData?.connectedAccounts?.length;
  }

  async fetchCurrentTabData() {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const currentTab = tabs[0];
    const urlOrigin = new URL(currentTab?.url ?? "").origin;
    this.currentTabData = {
      favIconUrl: currentTab?.favIconUrl ?? "",
      title: currentTab?.title ?? "",
      urlOrigin,
      connectedAccounts:
        (await StorageUtil.getDAppsConnectedAccountsData(urlOrigin))
          ?.accounts ?? [],
      connectedBlockchains:
        (await StorageUtil.getDAppsConnectedAccountsData(urlOrigin))
          ?.blockchains ?? [],
    };
  }

  async disconnectFromCurrentTab() {
    await StorageUtil.clearDAppsConnectedAccountsData(
      this.currentTabData?.urlOrigin,
    );
    await this.fetchCurrentTabData();
  }

  async readDAppRequestData() {
    const storedDAppRequestData = await StorageUtil.getDAppsRequestData();
    this.dAppRequestData = storedDAppRequestData;
  }

  addToResponseData(data: Record<string, unknown>) {
    const serializableData = getSerializableObject(data);
    this.responseData = { ...this.responseData, ...serializableData };
  }

  setCanProceed(decision: boolean) {
    this.canProceed = decision;
  }

  setOnPermissionCallBack(callBack: (hasApproved: boolean) => Promise<void>) {
    this.onPermissionCallBack = callBack;
  }

  async setApprovalProcessingStatus(status: {
    isProcessing?: boolean;
    hasApproved?: boolean;
    hasCompleted?: boolean;
  }) {
    this.approvalProcessingStatus = {
      ...this.approvalProcessingStatus,
      ...status,
    };
  }

  async onPermission(hasApproved: boolean) {
    try {
      this.setApprovalProcessingStatus({
        isProcessing: true,
        hasApproved,
      });
      await this.onPermissionCallBack(hasApproved);
      const response: DAppResponseType = {
        method: this.dAppRequestData?.method ?? "",
        action: EXTENSION_MESSAGES.DAPP_RESPONSE,
        hasApproved,
        requestId: this.dAppRequestData?.requestId,
        response: this.responseData,
      };
      await browser.runtime.sendMessage(response);
    } catch (error) {
      console.warn(
        "QrlWeb3Wallet: Error while resolving the permission request\n",
        error,
      );
    } finally {
      await StorageUtil.clearDAppsRequestData();
      this.setApprovalProcessingStatus({
        isProcessing: false,
        hasCompleted: true,
      });
    }
  }
}

export default DAppRequestStore;
