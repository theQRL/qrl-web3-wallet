import { WindowPostMessageStream } from "@theqrl/zond-wallet-provider/post-message-stream";
import { initializeProvider } from "@theqrl/zond-wallet-provider/providers";
import log from "loglevel";
import { v4 as uuid } from "uuid";
import {
  QRL_POST_MESSAGE_STREAM,
  QRL_WALLET_PROVIDER_NAME,
  QRL_WEB3_WALLET_PROVIDER_INFO,
} from "./constants/streamConstants";

const initializeInPageScript = () => {
  try {
    const qrlStream = new WindowPostMessageStream({
      name: QRL_POST_MESSAGE_STREAM.INPAGE,
      target: QRL_POST_MESSAGE_STREAM.CONTENT_SCRIPT,
    });

    initializeProvider({
      connectionStream: qrlStream,
      // The inpage provider, content script, and service worker all
      // multiplex over the same stream, and ObjectMultiplex routes by
      // substream name. Without this, `initializeProvider` falls back to
      // its library default ("zond-wallet-provider"), which no longer
      // matches the QRL_WALLET_PROVIDER_NAME ("qrl-wallet-provider") that
      // the content script and service worker register on their sides
      // (since the ZOND→QRL rename in commit f51d120) — so every
      // JSON-RPC request (incl. `qrl_requestAccounts`) is silently
      // dropped at the mux layer and the dApp's `provider.request()`
      // hangs forever.
      jsonRpcStreamName: QRL_WALLET_PROVIDER_NAME,
      logger: log,
      providerInfo: {
        uuid: uuid(),
        name: QRL_WEB3_WALLET_PROVIDER_INFO.NAME,
        icon: QRL_WEB3_WALLET_PROVIDER_INFO.ICON,
        rdns: QRL_WEB3_WALLET_PROVIDER_INFO.RDNS,
      },
    });
  } catch (error) {
    console.warn(
      "QrlWeb3Wallet: Failed to initialize the in-page script\n",
      error,
    );
  }
};

// This function accounces the qrl web3 wallet provider(based on EIP-6963), to be detected by the dApps.
initializeInPageScript();
