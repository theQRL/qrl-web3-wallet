import StorageUtil from "@/utilities/storageUtil";
import { JsonRpcEngine } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import { createEngineStream } from "@theqrl/qrl-wallet-provider/json-rpc-middleware-stream";
import { ExtensionPortStream } from "extension-port-stream";
import { pipeline } from "readable-stream";
import browser from "webextension-polyfill";
import {
  EXTENSION_MESSAGES,
  QRL_POST_MESSAGE_STREAM,
  QRL_WALLET_PROVIDER_NAME,
} from "./constants/streamConstants";
import LockManager, { LOCK_MANAGER_MESSAGES } from "./lockManager/lockManager";
import { appendSenderDataMiddleware } from "./middlewares/appendSenderDataMiddleware";
import { blockUnSupportedMethodsMiddleware } from "./middlewares/blockUnSupportedMethodsMiddleware";
import { restrictedMethodsMiddleware } from "./middlewares/restrictedMethodsMiddleware";
import { unrestrictedMethodsMiddleware } from "./middlewares/unrestrictedMethodsMiddleware";
import {
  handlePhishingRefreshAlarm,
  initializePhishingDetector,
  PHISHING_ALARM_NAME,
  setupPhishingRefreshAlarm,
} from "./phishing/phishingDetector";
import { checkForLastError } from "./utils/scriptUtils";
import { setupMultiplex } from "./utils/streamUtils";

type ContentScriptType = browser.Scripting.RegisteredContentScript;

const registerScripts = async () => {
  const previouslyRegisteredScriptIds = (
    await browser.scripting.getRegisteredContentScripts()
  ).map((script) => script.id);
  const contentScripts: ContentScriptType[] = [
    {
      id: "qrlInPageScript",
      matches: ["<all_urls>"],
      js: ["src/scripts/inPageScript.js"],
      runAt: "document_start",
      allFrames: true,
      // @ts-expect-error - webextension-polyfill types do not include the "world" property for content scripts
      // This is important. The script must run in the "MAIN" world,
      // so that the qrl provider will be available browser wide, not just isolated to the extension.
      world: "MAIN",
    },
  ];

  // This registers the in-page script to browser pages, if not already done.
  // "MAIN" world does not work if this script was invoked from manifest file instead.
  await browser.scripting.registerContentScripts(
    contentScripts.filter(
      (script) => !previouslyRegisteredScriptIds.includes(script.id),
    ),
  );
};

const prepareListeners = () => {
  // Listening to storage for displaying the badge in the extension.
  browser.storage.onChanged.addListener(async () => {
    const storedDAppRequestData = await StorageUtil.getDAppsRequestData();
    if (storedDAppRequestData) {
      // If there is a pending request, the badge with 1 notification will be displayed.
      browser.action.setBadgeText({ text: "1" });
      browser.action.setBadgeBackgroundColor({ color: "#4AAFFF" });
    } else {
      browser.action.setBadgeText({ text: "" });
    }
  });
  // Listening for messages related to the wallet locking.
  browser.runtime.onMessage.addListener(LockManager.lockManagerListener);
  // Listening for transaction notification requests from the popup.
  // IMPORTANT: Must NOT be async — returning a Promise from onMessage claims the
  // message channel and prevents lockManagerListener from responding.
  browser.runtime.onMessage.addListener((message) => {
    if (message.name !== LOCK_MANAGER_MESSAGES.SEND_TX_NOTIFICATION) {
      return;
    }
    (async () => {
      const settings = await StorageUtil.getSettings();
      if (!settings.notificationsEnabled && settings.notificationsEnabled !== undefined) {
        return;
      }
      const { status, amount, tokenSymbol, txHash } = message.data ?? {};
      const isConfirmed = status === "confirmed";
      const title = isConfirmed ? "Transaction Confirmed" : "Transaction Failed";
      const body =
        amount !== undefined && tokenSymbol
          ? `Your transaction of ${amount} ${tokenSymbol} ${isConfirmed ? "was confirmed" : "failed"}.`
          : `Your transaction ${isConfirmed ? "was confirmed" : "failed"}.`;
      try {
        await browser.notifications.create(`tx-${txHash ?? Date.now()}`, {
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/qrl/48.png"),
          title,
          message: body,
        });
      } catch (error) {
        console.error("QrlWeb3Wallet: Failed to create notification:", error);
      }
    })();
  });
  // Alarm listener for auto-lock and keep-alive.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === LockManager.AUTO_LOCK_ALARM) {
      LockManager.handleAutoLockAlarm();
    } else if (alarm.name === LockManager.KEEP_ALIVE_ALARM) {
      LockManager.handleKeepAliveAlarm();
    } else if (alarm.name === PHISHING_ALARM_NAME) {
      handlePhishingRefreshAlarm();
    }
  });
};

/**
 * Sends a message to the dapp(s) content script to signal it can connect to the background as
 * the backend is not active. It is required to re-connect dapps after service worker re-activates.
 * For non-dapp pages, the message will be sent and ignored.
 */
const announceServiceWorkerReady = async () => {
  const tabs = await browser.tabs.query({
    url: "<all_urls>",
    windowType: "normal",
  });

  for (const tab of tabs) {
    browser.tabs
      .sendMessage(tab.id ?? 0, {
        name: EXTENSION_MESSAGES.READY,
      })
      .then(() => {
        checkForLastError();
      })
      .catch(() => {
        // Expected for tabs without our content script (e.g. other extensions, chrome:// pages).
        checkForLastError();
      });
  }
};

/**
 * A method for creating a qrl provider.
 * Middlewares are pushed to the engine here.
 */
const setupProviderEngineEip1193 = ({
  sender,
}: {
  sender: browser.Runtime.MessageSender;
}) => {
  const engine = new JsonRpcEngine();

  // If the requested method is not supported, this ends the request.
  engine.push(blockUnSupportedMethodsMiddleware);
  // Appends the sender details to the request.
  engine.push(appendSenderDataMiddleware({ sender }));
  // Handles the unrestricted method calls without requiring user's approval
  engine.push(unrestrictedMethodsMiddleware);
  // Handles the dApp's connect wallet functionality
  engine.push(restrictedMethodsMiddleware);

  return engine;
};

/**
 * A method for serving qrl provider over a given stream.
 */
const setupProviderConnectionEip1193 = async (port: browser.Runtime.Port) => {
  const portStream = new ExtensionPortStream(port);
  const mux = setupMultiplex(portStream);
  const outStream = mux.createStream(QRL_WALLET_PROVIDER_NAME);
  const sender = port.sender;

  // messages between inpage and background
  const engine = setupProviderEngineEip1193({
    // @ts-expect-error - port.sender may be undefined but is always present for content script connections
    sender,
  });
  // setup connection
  const providerStream = createEngineStream({ engine });

  pipeline(outStream, providerStream, outStream, (err) => {
    console.warn("QrlWeb3Wallet: Error in stream pipeline\n", err);
    // handle any middleware cleanup
    // @ts-expect-error - _middleware is a private property on JsonRpcEngine not exposed in type definitions
    engine?._middleware?.forEach((mid: { destroy?: () => void }) => {
      if (mid.destroy && typeof mid.destroy === "function") {
        mid.destroy();
      }
    });
  });
};

const establishContenScriptConnection = () => {
  browser.runtime.onConnect.addListener(async (port) => {
    // Ensuring the port connected to is the content script
    if (port.name === QRL_POST_MESSAGE_STREAM.CONTENT_SCRIPT) {
      await announceServiceWorkerReady();
      await setupProviderConnectionEip1193(port);
    }
  });
};

const establishLockManagerConnection = () => {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === LOCK_MANAGER_MESSAGES.PORT) {
      port.postMessage({ name: LOCK_MANAGER_MESSAGES.IS_LOCK_MANAGER_READY });
    }
  });
};

const applySidePanelPreference = async () => {
  try {
    const settings = await StorageUtil.getSettings();
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: !!settings.sidePanelPreferred,
    });
    // Set side panel path with query parameter so the UI can detect side panel mode.
    await chrome.sidePanel.setOptions({
      path: "index.html?sidepanel=true",
    });
  } catch {
    // sidePanel API may not be available in all browsers.
  }
};

const enforceSessionStorageAccessLevel = async () => {
  // Pin session storage to TRUSTED_CONTEXTS so content scripts cannot read
  // the decrypted-keys backup. TRUSTED_CONTEXTS is the MV3 default; we set it
  // explicitly so a future Chromium default change cannot quietly widen us.
  try {
    await chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });
  } catch {
    // Older Chromium versions lack the API; the default already excludes
    // content scripts so the wallet remains safe.
  }
};

const initializeServiceWorker = async () => {
  // Register listeners first so the popup can always communicate with the service worker,
  // even if script registration fails.
  prepareListeners();
  establishContenScriptConnection();
  establishLockManagerConnection();

  await enforceSessionStorageAccessLevel();

  try {
    await registerScripts();
  } catch (error) {
    console.warn(
      "QrlWeb3Wallet: Failed to register content scripts\n",
      error,
    );
  }

  await applySidePanelPreference();

  // Initialize phishing detection
  await initializePhishingDetector();
  await setupPhishingRefreshAlarm();
};

// This is the starting point of service worker of qrl web3 wallet.
// This file is set as an entry in the "background" section of the manifest file.
initializeServiceWorker();
