import { BlockchainDataType } from "@/configuration/qrlBlockchainConfig";
import { EXTENSION_MESSAGES } from "@/scripts/constants/streamConstants";
import {
  DAppRequestType,
  DAppResponseType,
} from "@/scripts/middlewares/middlewareTypes";
import { getSerializableObject } from "@/scripts/utils/scriptUtils";
import { getRequestOrigin } from "@/utilities/originUtil";
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
  /**
   * The `requestId` that `onPermissionCallBack` was registered for.
   *
   * The callback is a closure over the request that was on screen when its
   * approval component rendered, so it must never be invoked for a different
   * request. Without this binding a handler registered for one request — e.g. a
   * transaction that has since timed out — stays installed and is executed by
   * the user's approval of whatever request replaced it.
   */
  onPermissionCallBackRequestId?: string;
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
      clearOnPermissionCallBack: action.bound,
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
          this.canProceed = false;
          this.approvalProcessingStatus = {
            isProcessing: false,
            hasApproved: false,
            hasCompleted: false,
          };
          // The pending request has changed, so the handler registered for the
          // previous one is stale. Drop it: the incoming request's approval
          // component installs its own, and until it does there is nothing to
          // run.
          this.clearOnPermissionCallBack();
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

  /**
   * The origin that actually made the pending request, taken from the
   * service-worker-stamped `senderData`.
   *
   * Approval screens must use this rather than `currentTabData`. The latter is
   * the *active tab*, which for a request from a cross-origin iframe or a
   * background tab is a different origin entirely — so seeding a permission
   * prompt from it offered the attacker's origin the victim dApp's own account
   * set, pre-selected. See CIPH-QRLW326-6.
   *
   * Derived by the shared `getRequestOrigin` rather than by a local `new URL`,
   * so an opaque origin — which serialises to the literal string `"null"` — is
   * normalised to `""` here exactly as it is on the middleware side. A getter
   * with its own derivation would read grants keyed by `"null"` even though the
   * write path refuses to create them. See CIPH-QRLW326-31 and -39.
   */
  get requestingOrigin(): string {
    return getRequestOrigin(this.dAppRequestData?.requestData?.senderData?.url);
  }

  /**
   * The accounts and chains already granted to the *requesting* origin. Empty for
   * an origin the user has not connected before, which is the point: the user
   * must then make an explicit selection rather than confirming a pre-ticked one.
   */
  async getRequestingOriginGrants(): Promise<{
    accounts: string[];
    blockchains: BlockchainDataType[];
  }> {
    const origin = this.requestingOrigin;
    if (!origin) return { accounts: [], blockchains: [] };
    const data = await StorageUtil.getDAppsConnectedAccountsData(origin);
    return {
      accounts: data?.accounts ?? [],
      blockchains: data?.blockchains ?? [],
    };
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
    // Bind the handler to the request that is on screen as it registers. Every
    // approval component registers from a render (or a click) in which
    // `dAppRequestData` is the request its closure captured, so this is the
    // request the handler is safe to act on — and only that one.
    this.onPermissionCallBackRequestId = this.dAppRequestData?.requestId;
  }

  clearOnPermissionCallBack() {
    this.onPermissionCallBack = async () => undefined;
    this.onPermissionCallBackRequestId = undefined;
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
    const { method = "", requestId } = this.dAppRequestData ?? {};
    // Only ever run a handler that was registered for the request currently on
    // screen. A mismatch means the pending request changed after the handler was
    // installed, so approving it would execute an action the user is not looking
    // at. Fail closed: report a rejection rather than running the wrong effect.
    const handlerMatchesRequest =
      this.onPermissionCallBackRequestId !== undefined &&
      this.onPermissionCallBackRequestId === requestId;
    const effectiveApproval = hasApproved && handlerMatchesRequest;

    try {
      this.setApprovalProcessingStatus({
        isProcessing: true,
        hasApproved: effectiveApproval,
      });
      if (handlerMatchesRequest) {
        await this.onPermissionCallBack(hasApproved);
      } else if (hasApproved) {
        console.warn(
          "QrlWeb3Wallet: refusing to run an approval handler registered for a different request",
          {
            registeredFor: this.onPermissionCallBackRequestId,
            currentRequest: requestId,
          },
        );
      }
      const isCurrentRequest = this.dAppRequestData?.requestId === requestId;
      const response: DAppResponseType = {
        method,
        action: EXTENSION_MESSAGES.DAPP_RESPONSE,
        hasApproved: effectiveApproval && isCurrentRequest,
        requestId,
        response: isCurrentRequest ? this.responseData : {},
      };
      await browser.runtime.sendMessage(response);
    } catch (error) {
      console.warn(
        "QrlWeb3Wallet: Error while resolving the permission request\n",
        error,
      );
    } finally {
      if (this.dAppRequestData?.requestId === requestId) {
        this.setApprovalProcessingStatus({
          isProcessing: false,
          hasCompleted: true,
        });
      }
    }
  }
}

export default DAppRequestStore;
