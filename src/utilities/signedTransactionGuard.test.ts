import { describe, expect, it, vi } from "vitest";

const { mockRecoverTransaction } = vi.hoisted(() => ({
  mockRecoverTransaction: vi.fn(),
}));

vi.mock("@theqrl/web3-qrl-accounts", () => ({
  recoverTransaction: mockRecoverTransaction,
}));

import { assertSignedTransactionSender } from "./signedTransactionGuard";

const RAW = "0xf86c0185...";
const FROM =
  "Q000000000000000000000000000000000000000000000000000000008a8eAfB1CF62bFbEb1741769DaE1A9dd4799619200000000000000000000000000000000";
const OTHER =
  "Q00000000000000000000000000000000000000000000000000000000fb08ff1f1376a14c055e9f56df80563e16722baa00000000000000000000000000000000";

describe("assertSignedTransactionSender", () => {
  it("passes when the recovered sender matches", () => {
    mockRecoverTransaction.mockReturnValue(FROM);
    expect(() => { assertSignedTransactionSender(RAW, FROM); }).not.toThrow();
  });

  it("passes regardless of checksum casing on either side", () => {
    mockRecoverTransaction.mockReturnValue(FROM.toUpperCase());
    expect(() =>
      { assertSignedTransactionSender(RAW, FROM.toLowerCase()); },
    ).not.toThrow();
  });

  it("throws when the recovered sender is a different account", () => {
    mockRecoverTransaction.mockReturnValue(OTHER);
    expect(() => { assertSignedTransactionSender(RAW, FROM); }).toThrow(
      /sender mismatch/i,
    );
  });

  it("names both addresses so a mismatch is diagnosable", () => {
    mockRecoverTransaction.mockReturnValue(OTHER);
    expect(() => { assertSignedTransactionSender(RAW, FROM); }).toThrow(
      new RegExp(`expected=${FROM}.*recovered=${OTHER}`),
    );
  });

  it("throws when recovery yields nothing rather than passing silently", () => {
    mockRecoverTransaction.mockReturnValue("");
    expect(() => { assertSignedTransactionSender(RAW, FROM); }).toThrow(
      /sender mismatch/i,
    );
  });

  it("throws when the expected sender is empty", () => {
    mockRecoverTransaction.mockReturnValue(FROM);
    expect(() => { assertSignedTransactionSender(RAW, ""); }).toThrow(
      /sender mismatch/i,
    );
  });
});
