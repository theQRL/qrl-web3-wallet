import { binToMnemonic } from "./mnemonicHelper";
import { Buffer } from "buffer";

export const getMnemonicFromHexSeed = (hexSeed?: string) => {
  if (!hexSeed) return "";
  const trimmedHexSeed = hexSeed.trim();
  if (!trimmedHexSeed) return "";
  // Strip the 0x prefix only when it is actually present. This used to strip two
  // characters unconditionally, so an unprefixed seed silently lost its first byte
  // and produced a wrong — and unrecoverable — mnemonic backup. Every current call
  // site passes a 0x-prefixed value, but the failure mode is severe enough to
  // guard. See CIPH-QRLW326-36.
  const withoutPrefix = /^0x/i.test(trimmedHexSeed)
    ? trimmedHexSeed.slice(2)
    : trimmedHexSeed;
  const hexSeedBin = Buffer.from(withoutPrefix, "hex");
  return binToMnemonic(hexSeedBin);
};
