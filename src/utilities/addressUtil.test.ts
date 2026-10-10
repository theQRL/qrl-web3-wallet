import {
  QRL_ADDRESS_LENGTH,
  QRL_EXAMPLE_ADDRESS,
  QRL_EXAMPLE_ADDRESS_2,
} from "@/constants/address";
import { describe, expect, it } from "vitest";
import AddressUtil, { RECOVERY_ONLY_ACCOUNT_MESSAGE } from "./addressUtil";
import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";

describe("addressUtil", () => {
  it("matches the English recovery-only message used by the transfer form", () => {
    expect(RECOVERY_ONLY_ACCOUNT_MESSAGE).toBe(
      en["transfer.errorRecoveryOnlyAccount"],
    );
  });

  it.each([en, de, es])(
    "uses the translated backup menu path for recovery-only accounts",
    (locale) => {
      const menuPath = [
        locale["settings.title"],
        locale["settings.data"],
        locale["settings.data.exportButton"],
      ].join(" > ");
      expect(locale["transfer.errorRecoveryOnlyAccount"]).toContain(menuPath);
    },
  );

  it("accepts 64-byte Q-prefixed QRL addresses", () => {
    expect(QRL_EXAMPLE_ADDRESS).toHaveLength(QRL_ADDRESS_LENGTH);
    expect(AddressUtil.isQrlAddress(QRL_EXAMPLE_ADDRESS)).toBe(true);
    expect(AddressUtil.isQrlAddress(QRL_EXAMPLE_ADDRESS_2)).toBe(true);
  });

  it("validates mixed-case checksum addresses", () => {
    const checksummedAddress =
      "QabaBABabaBAbAbAbABaBABaBabaBabaBAbabaBABABAbAbabababAbaBaBABABabABaBaBABABaBabaBABaBabABAbABabaBAbABAbABAbaBabABababAbaBaBabaBAB";
    const invalidChecksumAddress =
      "QaBababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab";

    expect(AddressUtil.isQrlAddress(checksummedAddress)).toBe(true);
    expect(AddressUtil.isQrlAddress(invalidChecksumAddress)).toBe(false);
  });

  it("rejects legacy 20-byte QRL addresses as current addresses", () => {
    const legacyAddress = "Q20B714091cF2a62DADda2847803e3f1B9D2D3779";

    expect(AddressUtil.isQrlAddress(legacyAddress)).toBe(false);
    expect(AddressUtil.isLegacyQrlAddress(legacyAddress)).toBe(true);
  });

  it("normalizes only valid current QRL addresses", () => {
    expect(AddressUtil.normalizeQrlAddress(` ${QRL_EXAMPLE_ADDRESS} `)).toBe(
      "Q000000000000000000000000000000000000000000000000000000008a8eAfB1CF62bFbEb1741769DaE1A9dd4799619200000000000000000000000000000000",
    );
    expect(() => AddressUtil.normalizeQrlAddress("Q1234")).toThrow(
      "Expected 129-character QRL address",
    );
  });

  it("converts current QRL addresses to SHAKE256 checksum form", () => {
    expect(AddressUtil.toChecksumQrlAddress(QRL_EXAMPLE_ADDRESS_2)).toBe(
      "Q0000000000000000000000000000000000000000000000000000000000FB08Ff1F1376a14c055e9f56Df80563E16722b00000000000000000000000000000000",
    );
  });

  it("shortens long addresses for compact UI display", () => {
    expect(AddressUtil.shortenQrlAddress(QRL_EXAMPLE_ADDRESS)).toBe(
      "Q000000000...00000000",
    );
  });
});
