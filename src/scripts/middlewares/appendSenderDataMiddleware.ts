import { JsonRpcMiddleware } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import { Json, JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import browser from "webextension-polyfill";

type appendSenderDataParams = {
  sender: browser.Runtime.MessageSender;
};

export const appendSenderDataMiddleware =
  ({
    sender,
  }: appendSenderDataParams): JsonRpcMiddleware<JsonRpcRequest, Json> =>
  (req, _, next) => {
    const { tab, url: senderUrl } = sender;
    // Use the URL of the frame that issued the request (sender.url) as the
    // canonical requester identity. sender.tab.url is the top-level tab URL
    // and would cause a cross-origin iframe to be attributed to its parent,
    // defeating origin-based permission and approval checks.
    // tabId / title / favIconUrl stay as UI-only context (no security boundary).
    req.senderData = {
      tabId: tab?.id,
      title: tab?.title,
      url: senderUrl,
      favIconUrl: tab?.favIconUrl,
    };
    next();
  };
