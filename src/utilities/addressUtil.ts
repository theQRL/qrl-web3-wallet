import { QRL_ADDRESS_LENGTH } from "@/constants/address";
import {
  isAddressString,
  toChecksumAddress,
} from "@theqrl/web3-validator";

export const LEGACY_ACCOUNT_RECOVERY_MESSAGE =
  "This account uses a legacy 20-byte address and cannot sign on this network. Import the recovery phrase you saved for it to use the same keys as a 64-byte account. Funds at the 20-byte address need a separate network migration.";

export const RECOVERY_ONLY_ACCOUNT_MESSAGE =
  "This account was imported from a recovery phrase that this wallet version cannot read, so it cannot sign. Its keys stay stored unchanged and are included in the backup from Settings > Data > Export Backup.";

class AddressUtil {
  static isQrlAddress(address: string): boolean {
    return isAddressString(address);
  }

  static isLegacyQrlAddress(address: string): boolean {
    return /^Q[0-9a-fA-F]{40}$/i.test(address);
  }

  static normalizeQrlAddress(address: string): string {
    const trimmed = address.trim();
    if (!AddressUtil.isQrlAddress(trimmed)) {
      throw new Error(`Expected ${QRL_ADDRESS_LENGTH}-character QRL address`);
    }
    return AddressUtil.toChecksumQrlAddress(trimmed);
  }

  static toChecksumQrlAddress(address: string): string {
    const trimmed = address.trim();
    if (!AddressUtil.isQrlAddress(trimmed)) {
      throw new Error(`Expected ${QRL_ADDRESS_LENGTH}-character QRL address`);
    }
    return toChecksumAddress(trimmed);
  }

  static shortenQrlAddress(address: string, headLength = 10, tailLength = 8): string {
    if (address.length <= headLength + tailLength) {
      return address;
    }
    return `${address.slice(0, headLength)}...${address.slice(-tailLength)}`;
  }
}

export default AddressUtil;
