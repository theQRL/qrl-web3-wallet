import { describe, expect, it } from "vitest";
import { getSubscriptionRpcUrl, QRL_BLOCKCHAINS } from "./qrlBlockchainConfig";

describe("subscription endpoint configuration", () => {
  it("leaves subscriptions disabled for built-in chains", () => {
    for (const chain of QRL_BLOCKCHAINS) {
      expect(getSubscriptionRpcUrl(chain.defaultWsRpcUrl)).toBeUndefined();
    }
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:8545/"])(
    "ignores the old automatically saved endpoint %s",
    (url) => {
      expect(getSubscriptionRpcUrl(url)).toBeUndefined();
    },
  );

  it("preserves an explicitly configured endpoint", () => {
    expect(getSubscriptionRpcUrl("https://rpc.example/subscriptions/")).toBe(
      "https://rpc.example/subscriptions",
    );
  });
});
