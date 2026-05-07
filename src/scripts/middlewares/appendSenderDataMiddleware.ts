import { JsonRpcMiddleware } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import { Json, JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";
import browser from "webextension-polyfill";

type appendSenderDataParams = {
  sender: browser.Runtime.MessageSender;
};

// Extends the upstream `senderData` shape with `mainFrameOrigin`. Permission
// and account-authorisation checks must continue to use `url` (the frame
// origin); phishing-detect and the approval popup additionally consume
// `mainFrameOrigin` (the parent tab origin) so a phishing top-level page
// hosting a connected dApp's iframe is caught.
export type ExtendedSenderData = {
  tabId?: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  mainFrameOrigin?: string;
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
    // mainFrameOrigin carries the parent tab URL for phishing-list lookup
    // and for popup display so users see both frame and parent origins.
    const senderData: ExtendedSenderData = {
      tabId: tab?.id,
      title: tab?.title,
      url: senderUrl,
      favIconUrl: tab?.favIconUrl,
      mainFrameOrigin: tab?.url,
    };
    req.senderData = senderData;
    next();
  };
