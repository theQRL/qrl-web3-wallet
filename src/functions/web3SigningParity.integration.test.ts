// @vitest-environment node
import { describe, expect, it } from "vitest";
import Web3 from "@theqrl/web3";
import { ExtendedSeed, Seed, newMLDSA87Descriptor } from "@theqrl/wallet.js";
import { FeeMarketEIP1559Transaction } from "@theqrl/web3-qrl-accounts";
import signedWithV1 from "./fixtures/signedTransactionWeb3v1.json";

// Constants below were produced by the @theqrl/web3 1.0.3 stack for exactly
// this seed and transaction. ML-DSA signatures are randomised, so the full
// raw transaction differs per call; every deterministic part is pinned here
// and the 1.0.3 signed transaction itself is kept as a fixture.
const web3 = new Web3();
const seed = ExtendedSeed.newExtendedSeed(
  newMLDSA87Descriptor(),
  new Seed(Uint8Array.from({ length: 48 }, (_, index) => index + 1)),
).toBytes();
const account = web3.qrl.accounts.seedToAccount(seed);
const recipient = web3.utils.toChecksumAddress(`Q${"ab".repeat(64)}`);
const transaction = {
  from: account.address,
  to: recipient,
  value: 1000,
  nonce: 7,
  chainId: 1,
  networkId: 1,
  type: 2,
  gasLimit: 100000,
  maxFeePerGas: 2000000000,
  maxPriorityFeePerGas: 1000000000,
  data: "0x1234",
};

const EXPECTED_ADDRESS =
  "Q82F78B319474280F1a3C9937C6160d0842588f4707A32594cA396EF7000b5f24864a7D72e74054643F1447F6165e4d49C6a54b6BD7FDf3E907F4182E3b4447C3";
const EXPECTED_SIGNING_HASH =
  "0x429bee9876f99a06b2f0a27a1db3423b39ae858a8b2cbb5a905ed7eeb20da0af";
const EXPECTED_RAW_LENGTH = 14648;
// Everything in the raw transaction before the signature field.
const EXPECTED_RAW_HEAD =
  "0x02f91c970107843b9aca008477359400830186a0b840abababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababababab8203e8821234c08301000080";
const EXPECTED_PUBLIC_KEY_KECCAK =
  "0x85ce675ff6ffa2086266a4aa6ebf764ed7d00758577b1bbf3cf81238112104ab";

const parse = (raw: string) =>
  FeeMarketEIP1559Transaction.fromSerializedTx(web3.utils.hexToBytes(raw));

const signingHash = (parsed: FeeMarketEIP1559Transaction) => {
  if (!parsed.descriptor) {
    throw new Error("signed transaction lacks a descriptor");
  }
  return web3.utils.bytesToHex(
    parsed.getMessageToSign(
      parsed.descriptor,
      parsed.extraParams ?? new Uint8Array(),
    ),
  );
};

describe("transaction signing parity with the 1.0.3 stack", () => {
  it("derives the same address from the fixed seed", () => {
    expect(account.address).toBe(EXPECTED_ADDRESS);
  });

  it("signs the fixed transaction with the same signing hash, layout and public key", async () => {
    const signed = await web3.qrl.accounts.signTransaction(
      transaction,
      account.seed,
    );
    const parsed = parse(signed.rawTransaction);
    expect(signingHash(parsed)).toBe(EXPECTED_SIGNING_HASH);
    expect(signed.rawTransaction).toHaveLength(EXPECTED_RAW_LENGTH);
    expect(signed.rawTransaction.startsWith(EXPECTED_RAW_HEAD)).toBe(true);
    expect(web3.utils.sha3Raw(signed.rawTransaction)).toBe(
      signed.transactionHash,
    );
    expect(parsed.publicKey).toBeDefined();
    expect(
      web3.utils.sha3Raw(
        web3.utils.bytesToHex(parsed.publicKey ?? new Uint8Array()),
      ),
    ).toBe(EXPECTED_PUBLIC_KEY_KECCAK);
    expect(parsed.verifySignature()).toBe(true);
    expect(parsed.getSenderAddress().toString().toLowerCase()).toBe(
      account.address.toLowerCase(),
    );
  });

  it("accepts a transaction signed by 1.0.3 and recovers the same sender and hash", () => {
    const { rawTransaction, transactionHash } = signedWithV1;
    expect(rawTransaction).toHaveLength(EXPECTED_RAW_LENGTH);
    expect(web3.utils.sha3Raw(rawTransaction)).toBe(transactionHash);
    const parsed = parse(rawTransaction);
    expect(signingHash(parsed)).toBe(EXPECTED_SIGNING_HASH);
    expect(parsed.verifySignature()).toBe(true);
    expect(parsed.getSenderAddress().toString().toLowerCase()).toBe(
      account.address.toLowerCase(),
    );
  });
});

// hashMessage values recorded on @theqrl/web3 1.0.3.
const V1_HELLO_HASH =
  "0x6e447913dabc7532313e90889756c93e9e13c9ef22855267945c87189e820d31";
const V1_HEX_1234_HASH =
  "0x2a0eeed79c5f517afc69e4c075f26b37b8a470e4bba020b76ecfd3fd1fea7364";
const V1_ABC_HASH =
  "0x01193153c23e49664699e8206e0dc62bb265e1ea2235e7947b1c333b99bc6a75";

// Values recorded on 2.0.0 for messages whose digest differs from 1.0.3.
const V2_NUL_LEADING_ABC_HASH =
  "0x5e44eceb106ca39acbb8d10e8ed6bcdbd5dec594b9f2b764c047f7a9b43f8c87";
const V2_NUL_TRAILING_ABC_HASH =
  "0x5698d4cc68485f2c41385fdb65eec027e218993fdb3c82bdbb71add45b28f64c";
const READABLE_HEX = `0x${Buffer.from("Sign in to evil.example as owner").toString("hex")}`;
const V2_NUL_LEADING_HEX_HASH =
  "0x5a0b9f0364a3404f3ab220b30c92ac64787947d935600bf3875390ea46ce7838";

describe("personal_sign message hashing against the 1.0.3 stack", () => {
  it("hashes plain text and hex messages as 1.0.3 did", () => {
    const { hashMessage } = web3.qrl.accounts;
    expect(hashMessage("hello")).toBe(V1_HELLO_HASH);
    expect(hashMessage("0x1234")).toBe(V1_HEX_1234_HASH);
    expect(hashMessage("0X1234")).toBe(V1_HEX_1234_HASH);
    expect(hashMessage("abc")).toBe(V1_ABC_HASH);
  });

  // Documented difference: 1.0.3 dropped NUL edge characters before hashing,
  // 2.0.0 hashes every byte. The wallet signs exactly what 2.0.0 hashes.
  it("hashes the NUL edge characters of a message, which 1.0.3 dropped", () => {
    const { hashMessage } = web3.qrl.accounts;
    expect(hashMessage("\u0000abc")).toBe(V2_NUL_LEADING_ABC_HASH);
    expect(hashMessage("abc\u0000")).toBe(V2_NUL_TRAILING_ABC_HASH);
    expect(hashMessage("\u0000abc")).not.toBe(V1_ABC_HASH);
    expect(hashMessage(`\u0000${READABLE_HEX}`)).toBe(V2_NUL_LEADING_HEX_HASH);
    // A NUL in front keeps hex-looking text a text message.
    expect(hashMessage(`\u0000${READABLE_HEX}`)).not.toBe(
      hashMessage(READABLE_HEX),
    );
  });

  it("rejects an odd-length hex message, as 1.0.3 did", () => {
    expect(() => web3.qrl.accounts.sign("0x123", account.seed)).toThrow();
  });
});
