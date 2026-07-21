import { describe, expect, it } from "vitest";
import { QRL_ADDRESS_BYTES, QRL_ADDRESS_LENGTH } from "@/constants/address";
import { LEDGER_CONFIG } from "@/constants/ledger";
import {
  packDerivationPath,
  getDerivationPath,
  splitIntoChunks,
  combineSignatureChunks,
  checkStatusWord,
  extractResponseData,
  createLedgerError,
  isRetryableError,
  isUserRejection,
  isWrongApp,
  parseQrlAddress,
  parsePublicKeyResponse,
  parseAppVersion,
  parseAppName,
  hexToBuffer,
  bufferToHex,
  DILITHIUM_PUBLIC_KEY_SIZE,
} from "./ledgerApdu";

describe("ledgerApdu", () => {
  describe("packDerivationPath", () => {
    it("should pack standard BIP-44 path correctly", () => {
      const path = "m/44'/238'/0'/0/0";
      const result = packDerivationPath(path);

      expect(result.length).toBe(21);
      // First byte: number of components (5)
      expect(result[0]).toBe(5);

      // 44' (hardened) = 44 + 0x80000000 = 0x8000002C
      expect(result.readUInt32BE(1)).toBe(0x8000002c);

      // 238' (hardened) = 238 + 0x80000000 = 0x800000EE
      expect(result.readUInt32BE(5)).toBe(0x800000ee);

      // 0' (hardened) = 0 + 0x80000000 = 0x80000000
      expect(result.readUInt32BE(9)).toBe(0x80000000);

      // 0 (not hardened)
      expect(result.readUInt32BE(13)).toBe(0);

      // 0 (not hardened)
      expect(result.readUInt32BE(17)).toBe(0);
    });

    it("should pack path with different index correctly", () => {
      const path = "m/44'/238'/0'/0/5";
      const result = packDerivationPath(path);

      expect(result.length).toBe(21);
      expect(result.readUInt32BE(17)).toBe(5);
    });

    it("should pack path with different account correctly", () => {
      const path = "m/44'/238'/2'/0/0";
      const result = packDerivationPath(path);

      // 2' (hardened) = 2 + 0x80000000 = 0x80000002
      expect(result.readUInt32BE(9)).toBe(0x80000002);
    });

    it("should throw error for invalid path with wrong number of components", () => {
      expect(() => packDerivationPath("m/44'/238'/0'/0")).toThrow(
        "Invalid derivation path: expected 5 components"
      );

      expect(() => packDerivationPath("m/44'/238'/0'/0/0/1")).toThrow(
        "Invalid derivation path: expected 5 components"
      );
    });

    it("should throw error for invalid path component", () => {
      expect(() => packDerivationPath("m/44'/238'/abc/0/0")).toThrow(
        "Invalid path component"
      );
    });

    it("should handle path without m/ prefix", () => {
      const path = "44'/238'/0'/0/0";
      const result = packDerivationPath(path);

      expect(result.length).toBe(21);
      expect(result[0]).toBe(5);
    });
  });

  describe("getDerivationPath", () => {
    it("should generate path for index 0", () => {
      const result = getDerivationPath(0);
      expect(result).toBe(`m/44'/${LEDGER_CONFIG.COIN_TYPE}'/0'/0/0`);
    });

    it("should generate path for index 5", () => {
      const result = getDerivationPath(5);
      expect(result).toBe(`m/44'/${LEDGER_CONFIG.COIN_TYPE}'/0'/0/5`);
    });

    it("should generate path for large index", () => {
      const result = getDerivationPath(999);
      expect(result).toBe(`m/44'/${LEDGER_CONFIG.COIN_TYPE}'/0'/0/999`);
    });
  });

  describe("splitIntoChunks", () => {
    it("should return single chunk for small data", () => {
      const data = Buffer.from("hello");
      const chunks = splitIntoChunks(data);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual(data);
    });

    it("should split data into multiple chunks", () => {
      const data = Buffer.alloc(300, 0xaa);
      const chunks = splitIntoChunks(data, 100);

      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(100);
      expect(chunks[1].length).toBe(100);
      expect(chunks[2].length).toBe(100);
    });

    it("should handle data not evenly divisible by chunk size", () => {
      const data = Buffer.alloc(250, 0xbb);
      const chunks = splitIntoChunks(data, 100);

      expect(chunks.length).toBe(3);
      expect(chunks[0].length).toBe(100);
      expect(chunks[1].length).toBe(100);
      expect(chunks[2].length).toBe(50);
    });

    it("should return empty chunk for empty buffer", () => {
      const data = Buffer.alloc(0);
      const chunks = splitIntoChunks(data);

      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(0);
    });

    it("should use default max size of 255", () => {
      const data = Buffer.alloc(300, 0xcc);
      const chunks = splitIntoChunks(data);

      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(255);
      expect(chunks[1].length).toBe(45);
    });
  });

  describe("combineSignatureChunks", () => {
    it("should combine multiple chunks into single buffer", () => {
      const chunk1 = Buffer.from([0x01, 0x02, 0x03]);
      const chunk2 = Buffer.from([0x04, 0x05, 0x06]);
      const chunk3 = Buffer.from([0x07, 0x08]);

      const result = combineSignatureChunks([chunk1, chunk2, chunk3]);

      expect(result).toEqual(
        Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
      );
    });

    it("should return empty buffer for empty array", () => {
      const result = combineSignatureChunks([]);
      expect(result.length).toBe(0);
    });

    it("should return same buffer for single chunk", () => {
      const chunk = Buffer.from([0xaa, 0xbb, 0xcc]);
      const result = combineSignatureChunks([chunk]);

      expect(result).toEqual(chunk);
    });
  });

  describe("checkStatusWord", () => {
    it("should not throw for success status (0x9000)", () => {
      const response = Buffer.from([0x01, 0x02, 0x90, 0x00]);

      expect(() => checkStatusWord(response)).not.toThrow();
    });

    it("should throw for user rejection (0x6985)", () => {
      const response = Buffer.from([0x69, 0x85]);

      expect(() => checkStatusWord(response)).toThrow();
    });

    it("should throw for wrong app (0x6E00)", () => {
      const response = Buffer.from([0x6e, 0x00]);

      expect(() => checkStatusWord(response)).toThrow();
    });

    it("should throw for response too short", () => {
      const response = Buffer.from([0x90]);

      expect(() => checkStatusWord(response)).toThrow(
        "Invalid APDU response - too short"
      );
    });

    it("should throw with correct error message for known status codes", () => {
      const response = Buffer.from([0xb0, 0x05]); // TX_PARSING_FAIL

      try {
        checkStatusWord(response);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect((error as { statusCode: number }).statusCode).toBe(0xb005);
      }
    });
  });

  describe("extractResponseData", () => {
    it("should extract data without status word", () => {
      const response = Buffer.from([0x01, 0x02, 0x03, 0x90, 0x00]);
      const data = extractResponseData(response);

      expect(data).toEqual(Buffer.from([0x01, 0x02, 0x03]));
    });

    it("should return empty buffer for minimal response", () => {
      const response = Buffer.from([0x90, 0x00]);
      const data = extractResponseData(response);

      expect(data.length).toBe(0);
    });

    it("should return empty buffer for response shorter than 2 bytes", () => {
      const response = Buffer.from([0x90]);
      const data = extractResponseData(response);

      expect(data.length).toBe(0);
    });
  });

  describe("createLedgerError", () => {
    it("should create error with all properties", () => {
      const error = createLedgerError(0x6985, "User rejected");

      expect(error.statusCode).toBe(0x6985);
      expect(error.message).toBe("User rejected");
      expect(error.retryable).toBe(false); // User rejection is not retryable
    });

    it("should mark retryable errors correctly", () => {
      const error = createLedgerError(0xb000, "Response length error");

      expect(error.retryable).toBe(true);
    });

    it("should handle zero status code", () => {
      const error = createLedgerError(0, "Generic error");

      expect(error.statusCode).toBe(0);
      expect(error.retryable).toBe(true);
    });
  });

  describe("isRetryableError", () => {
    it("should return false for user rejection", () => {
      expect(isRetryableError(LEDGER_CONFIG.STATUS.DENY)).toBe(false);
    });

    it("should return false for wrong app", () => {
      expect(isRetryableError(LEDGER_CONFIG.STATUS.CLA_NOT_SUPPORTED)).toBe(
        false
      );
    });

    it("should return false for unsupported instruction", () => {
      expect(isRetryableError(LEDGER_CONFIG.STATUS.INS_NOT_SUPPORTED)).toBe(
        false
      );
    });

    it("should return false for TX parsing failure", () => {
      expect(isRetryableError(LEDGER_CONFIG.STATUS.TX_PARSING_FAIL)).toBe(false);
    });

    it("should return true for other errors", () => {
      expect(isRetryableError(LEDGER_CONFIG.STATUS.WRONG_RESPONSE_LENGTH)).toBe(
        true
      );
      expect(isRetryableError(LEDGER_CONFIG.STATUS.SIGNATURE_FAIL)).toBe(true);
      expect(isRetryableError(0)).toBe(true);
    });
  });

  describe("isUserRejection", () => {
    it("should return true for DENY status", () => {
      expect(isUserRejection(LEDGER_CONFIG.STATUS.DENY)).toBe(true);
    });

    it("should return false for other statuses", () => {
      expect(isUserRejection(LEDGER_CONFIG.STATUS.OK)).toBe(false);
      expect(isUserRejection(LEDGER_CONFIG.STATUS.CLA_NOT_SUPPORTED)).toBe(
        false
      );
      expect(isUserRejection(0)).toBe(false);
    });
  });

  describe("isWrongApp", () => {
    it("should return true for CLA_NOT_SUPPORTED status", () => {
      expect(isWrongApp(LEDGER_CONFIG.STATUS.CLA_NOT_SUPPORTED)).toBe(true);
    });

    it("should return false for other statuses", () => {
      expect(isWrongApp(LEDGER_CONFIG.STATUS.OK)).toBe(false);
      expect(isWrongApp(LEDGER_CONFIG.STATUS.DENY)).toBe(false);
      expect(isWrongApp(0)).toBe(false);
    });
  });

  describe("parseQrlAddress", () => {
    it("should parse valid QRL address from response", () => {
      // 'Q' prefix (0x51) + 64 bytes address + success status
      const addressBytes = Buffer.alloc(QRL_ADDRESS_BYTES, 0xab);
      const response = Buffer.concat([
        Buffer.from([0x51]), // 'Q'
        addressBytes,
        Buffer.from([0x90, 0x00]), // Success
      ]);

      const address = parseQrlAddress(response);

      expect(address.startsWith("Q")).toBe(true);
      expect(address.length).toBe(QRL_ADDRESS_LENGTH);
    });

    it("should throw for invalid prefix", () => {
      const response = Buffer.concat([
        Buffer.from([0x58]), // 'X' instead of 'Q'
        Buffer.alloc(QRL_ADDRESS_BYTES, 0xab),
        Buffer.from([0x90, 0x00]),
      ]);

      expect(() => parseQrlAddress(response)).toThrow(
        "Invalid address prefix"
      );
    });

    it("should throw for response too short", () => {
      const response = Buffer.from([0x51, 0x01, 0x02, 0x90, 0x00]);

      expect(() => parseQrlAddress(response)).toThrow(
        "Invalid response length"
      );
    });

    it("should throw for error status", () => {
      const response = Buffer.concat([
        Buffer.from([0x51]),
        Buffer.alloc(QRL_ADDRESS_BYTES, 0xab),
        Buffer.from([0x69, 0x85]), // User rejection
      ]);

      expect(() => parseQrlAddress(response)).toThrow();
    });
  });

  describe("parsePublicKeyResponse", () => {
    it("should parse address without public key", () => {
      // 'Q' prefix + 64 bytes address + success status (no public key)
      const addressBytes = Buffer.alloc(QRL_ADDRESS_BYTES, 0xab);
      const response = Buffer.concat([
        Buffer.from([0x51]), // 'Q'
        addressBytes,
        Buffer.from([0x90, 0x00]), // Success
      ]);

      const result = parsePublicKeyResponse(response);

      expect(result.address.startsWith("Q")).toBe(true);
      expect(result.address.length).toBe(QRL_ADDRESS_LENGTH);
      expect(result.publicKey).toBe(""); // No public key in response
    });

    it("should parse address with public key", () => {
      // 'Q' prefix + 64 bytes address + public key + success status
      const addressBytes = Buffer.alloc(QRL_ADDRESS_BYTES, 0xab);
      const publicKeyBytes = Buffer.alloc(100, 0xcc); // Simplified public key
      const response = Buffer.concat([
        Buffer.from([0x51]), // 'Q'
        addressBytes,
        publicKeyBytes,
        Buffer.from([0x90, 0x00]), // Success
      ]);

      const result = parsePublicKeyResponse(response);

      expect(result.address.startsWith("Q")).toBe(true);
      expect(result.address.length).toBe(QRL_ADDRESS_LENGTH);
      expect(result.publicKey).toMatch(/^0x/);
      expect(result.publicKey.length).toBe(2 + 100 * 2); // 0x + 100 bytes as hex
    });

    it("should parse full Dilithium public key", () => {
      // 'Q' prefix + 64 bytes address + 2528 bytes Dilithium key + success status
      const addressBytes = Buffer.alloc(QRL_ADDRESS_BYTES, 0xab);
      const publicKeyBytes = Buffer.alloc(DILITHIUM_PUBLIC_KEY_SIZE, 0xdd);
      const response = Buffer.concat([
        Buffer.from([0x51]), // 'Q'
        addressBytes,
        publicKeyBytes,
        Buffer.from([0x90, 0x00]), // Success
      ]);

      const result = parsePublicKeyResponse(response);

      expect(result.address.startsWith("Q")).toBe(true);
      expect(result.publicKey).toMatch(/^0x/);
      // 0x prefix + 2528 bytes as hex (2 chars per byte)
      expect(result.publicKey.length).toBe(2 + DILITHIUM_PUBLIC_KEY_SIZE * 2);
    });

    it("should throw for invalid prefix", () => {
      const response = Buffer.concat([
        Buffer.from([0x58]), // 'X' instead of 'Q'
        Buffer.alloc(QRL_ADDRESS_BYTES, 0xab),
        Buffer.from([0x90, 0x00]),
      ]);

      expect(() => parsePublicKeyResponse(response)).toThrow(
        "Invalid address prefix"
      );
    });

    it("should throw for response too short", () => {
      const response = Buffer.from([0x51, 0x01, 0x02, 0x90, 0x00]);

      expect(() => parsePublicKeyResponse(response)).toThrow(
        "Invalid response length"
      );
    });

    it("should throw for error status", () => {
      const response = Buffer.concat([
        Buffer.from([0x51]),
        Buffer.alloc(QRL_ADDRESS_BYTES, 0xab),
        Buffer.from([0x69, 0x85]), // User rejection
      ]);

      expect(() => parsePublicKeyResponse(response)).toThrow();
    });
  });

  describe("parseAppVersion", () => {
    it("should parse version correctly", () => {
      const response = Buffer.from([0x01, 0x02, 0x03, 0x90, 0x00]);
      const version = parseAppVersion(response);

      expect(version).toBe("1.2.3");
    });

    it("should handle version 0.0.0", () => {
      const response = Buffer.from([0x00, 0x00, 0x00, 0x90, 0x00]);
      const version = parseAppVersion(response);

      expect(version).toBe("0.0.0");
    });

    it("should handle large version numbers", () => {
      const response = Buffer.from([0x0a, 0x14, 0x1e, 0x90, 0x00]);
      const version = parseAppVersion(response);

      expect(version).toBe("10.20.30");
    });

    it("should throw for response too short", () => {
      const response = Buffer.from([0x01, 0x02, 0x90, 0x00]);

      expect(() => parseAppVersion(response)).toThrow(
        "Invalid version response length"
      );
    });

    it("should throw for error status", () => {
      const response = Buffer.from([0x01, 0x02, 0x03, 0x6e, 0x00]);

      expect(() => parseAppVersion(response)).toThrow();
    });
  });

  describe("parseAppName", () => {
    it("should parse app name correctly", () => {
      const nameBytes = Buffer.from("QRL Zond", "ascii");
      const response = Buffer.concat([nameBytes, Buffer.from([0x90, 0x00])]);

      const name = parseAppName(response);

      expect(name).toBe("QRL Zond");
    });

    it("should handle empty app name", () => {
      const response = Buffer.from([0x90, 0x00]);
      const name = parseAppName(response);

      expect(name).toBe("");
    });

    it("should throw for error status", () => {
      const response = Buffer.from([0x51, 0x52, 0x4c, 0x6e, 0x00]);

      expect(() => parseAppName(response)).toThrow();
    });
  });

  describe("hexToBuffer", () => {
    it("should convert hex string to buffer", () => {
      const result = hexToBuffer("aabbcc");

      expect(result).toEqual(Buffer.from([0xaa, 0xbb, 0xcc]));
    });

    it("should handle 0x prefix", () => {
      const result = hexToBuffer("0xaabbcc");

      expect(result).toEqual(Buffer.from([0xaa, 0xbb, 0xcc]));
    });

    it("should handle empty string", () => {
      const result = hexToBuffer("");

      expect(result.length).toBe(0);
    });

    it("should handle 0x only", () => {
      const result = hexToBuffer("0x");

      expect(result.length).toBe(0);
    });
  });

  describe("bufferToHex", () => {
    it("should convert buffer to hex string with 0x prefix", () => {
      const buffer = Buffer.from([0xaa, 0xbb, 0xcc]);
      const result = bufferToHex(buffer);

      expect(result).toBe("0xaabbcc");
    });

    it("should handle empty buffer", () => {
      const buffer = Buffer.alloc(0);
      const result = bufferToHex(buffer);

      expect(result).toBe("0x");
    });

    it("should handle single byte", () => {
      const buffer = Buffer.from([0x0f]);
      const result = bufferToHex(buffer);

      expect(result).toBe("0x0f");
    });
  });

  describe("hexToBuffer and bufferToHex roundtrip", () => {
    it("should roundtrip correctly", () => {
      const original = "0xdeadbeef";
      const buffer = hexToBuffer(original);
      const result = bufferToHex(buffer);

      expect(result).toBe(original);
    });

    it("should normalize hex without prefix", () => {
      const original = "deadbeef";
      const buffer = hexToBuffer(original);
      const result = bufferToHex(buffer);

      expect(result).toBe("0x" + original);
    });
  });
});
