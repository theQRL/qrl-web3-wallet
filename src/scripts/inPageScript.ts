import { WindowPostMessageStream } from "@theqrl/qrl-wallet-provider/post-message-stream";
import { initializeProvider } from "@theqrl/qrl-wallet-provider/providers";
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
