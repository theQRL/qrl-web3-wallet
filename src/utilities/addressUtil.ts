import { QRL_ADDRESS_LENGTH } from "@/constants/address";
import {
  isAddressString,
  toChecksumAddress,
} from "@theqrl/web3-validator";

class AddressUtil {
  static isQrlAddress(address: string): boolean {
    return isAddressString(address);
  }

  static isLegacyQrlAddress(address: string): boolean {
    return /^Q[0-9a-fA-F]{40}$/.test(address);
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
