import { describe, expect, it } from "vitest";
import {
  readStoredHistoryEntry,
  readStoredNftCollection,
  readStoredTransferDraft,
} from "./storedNames";

describe("stored names", () => {
  it("returns values that are not stored records as they are", () => {
    for (const value of [undefined, null, "text", 7, ["isZrc20Token"]]) {
      expect(readStoredHistoryEntry(value)).toBe(value);
      expect(readStoredNftCollection(value)).toBe(value);
    }
  });

  it("returns an empty draft for anything that is not a stored draft", () => {
    for (const value of [undefined, null, "text", 7, []]) {
      expect(readStoredTransferDraft(value)).toEqual({});
    }
  });

  it("does not change the stored object it reads", () => {
    const entry = Object.freeze({ isZrc20Token: true, amount: 1 });
    expect(readStoredHistoryEntry(entry)).toEqual({
      isQrc20Token: true,
      amount: 1,
    });
    expect(entry).toEqual({ isZrc20Token: true, amount: 1 });
  });

  it("keeps an unknown NFT standard and a current one as stored", () => {
    const unknown = { standard: "SOMETHING" };
    const current = { standard: "QRC1155" };
    expect(readStoredNftCollection(unknown)).toBe(unknown);
    expect(readStoredNftCollection(current)).toBe(current);
    expect(readStoredNftCollection({ standard: "toString" })).toEqual({
      standard: "toString",
    });
  });
});
