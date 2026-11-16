import { describe, expect, it } from "vitest";
import { checkWalletWatchAssetParams } from "./restrictedMethodsMiddlewareUtils";

// No options, so a request that passes the type check stops at the next
// check, whose message differs from the type error.
const check = (type: string) =>
  checkWalletWatchAssetParams({ type, options: {} } as never);

describe("wallet_watchAsset asset type", () => {
  it.each(["QRC20", "qrc20", "Qrc20"])("accepts %s", async (type) => {
    const result = await check(type);
    expect(result.proceedError?.message).toBe(
      "Must specify address, symbol, and decimals.",
    );
  });

  it.each(["ZRC20", "zrc20"])(
    "still accepts the earlier name %s",
    async (type) => {
      const result = await check(type);
      expect(result.proceedError?.message).toBe(
        "Must specify address, symbol, and decimals.",
      );
    },
  );

  it.each(["ERC20", "QRC721", "", "QRC-20"])("rejects %j", async (type) => {
    const result = await check(type);
    expect(result.canProceed).toBe(false);
    expect(result.proceedError?.message).toBe("Asset type should be QRC20.");
  });
});
