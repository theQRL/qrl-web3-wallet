import { describe, expect, it } from "vitest";
import { restoredPage } from "./restoredPage";
import { ROUTES } from "./router";

describe("restoredPage", () => {
  it("opens the token list for the path builds before the QRC-20 rename saved", () => {
    expect(restoredPage("/all-zrc-20-tokens")).toBe(ROUTES.ALL_QRC_20_TOKENS);
  });

  it("returns a current path unchanged", () => {
    expect(restoredPage(ROUTES.ALL_QRC_20_TOKENS)).toBe(
      ROUTES.ALL_QRC_20_TOKENS,
    );
    expect(restoredPage(ROUTES.ACCOUNT_LIST)).toBe(ROUTES.ACCOUNT_LIST);
  });
});
