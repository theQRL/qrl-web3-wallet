// @vitest-environment node
import { describe, expect, it } from "vitest";
import Web3 from "@theqrl/web3";
import {
  ExtendedSeed,
  MLDSA87,
  Seed,
  newMLDSA87Descriptor,
} from "@theqrl/wallet.js";
import { FeeMarketEIP1559Transaction } from "@theqrl/web3-qrl-accounts";
import { getEncodedQRLTypedData } from "@theqrl/web3-qrl-abi";
import { validator } from "@theqrl/web3-validator";
import { ZRC_20_CONTRACT_ABI } from "@/constants/zrc20Token";
import { ZRC_721_CONTRACT_ABI } from "@/constants/nftToken";
import { getHexSeedFromMnemonic } from "./getHexSeedFromMnemonic";
import { getMnemonicFromHexSeed } from "./getMnemonicFromHexSeed";

const web3 = new Web3();
const seed = ExtendedSeed.newExtendedSeed(
  newMLDSA87Descriptor(),
  new Seed(Uint8Array.from({ length: 48 }, (_, index) => index + 1)),
).toBytes();
const sender = web3.qrl.accounts.seedToAccount(seed);
const recipient = web3.utils.toChecksumAddress(`Q${"ab".repeat(64)}`);
const contractAddress = web3.utils.toChecksumAddress(`Q${"cd".repeat(64)}`);
const transferAbi = {
  name: "transfer",
  type: "function" as const,
  inputs: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
  ],
};
const transaction = {
  from: sender.address,
  nonce: 7,
  chainId: 1,
  networkId: 1,
  type: 2,
  gasLimit: 100000,
  maxFeePerGas: 2,
  maxPriorityFeePerGas: 1,
};

describe("64-byte wallet stack", () => {
  it("derives, creates and imports 64-byte accounts with matching wallet.js identity", () => {
    const wallet = MLDSA87.newWalletFromExtendedSeed(new ExtendedSeed(seed));
    const created = web3.qrl.accounts.create();
    const imported = web3.qrl.accounts.seedToAccount(
      getHexSeedFromMnemonic(getMnemonicFromHexSeed(sender.seed)),
    );
    for (const account of [sender, created, imported]) {
      expect(account.address).toMatch(/^Q[0-9a-fA-F]{128}$/);
      expect(() =>
        validator.validate(["address"], [account.address]),
      ).not.toThrow();
      expect(web3.utils.toChecksumAddress(account.address)).toBe(
        account.address,
      );
      expect(web3.utils.hexToBytes(account.seed)).toHaveLength(51);
    }
    expect(imported.address).toBe(sender.address);
    expect(wallet.getAddressStr().toLowerCase()).toBe(
      sender.address.toLowerCase(),
    );
    expect(() =>
      validator.validate(["address"], [`Q${"ab".repeat(20)}`]),
    ).toThrow();
    wallet.zeroize();
  });

  it("encodes transfer(address,uint256) through the ABI and contract APIs", () => {
    const data = web3.qrl.abi.encodeFunctionCall(transferAbi, [
      recipient,
      "42",
    ]);
    const contract = new web3.qrl.Contract(
      ZRC_20_CONTRACT_ABI,
      contractAddress,
    );
    expect(contract.methods.transfer(recipient, 42n).encodeABI()).toBe(data);
    expect(data.slice(0, 10)).toBe(
      web3.qrl.abi.encodeFunctionSignature(transferAbi),
    );
    const decoded = web3.qrl.abi.decodeParameters(
      transferAbi.inputs,
      `0x${data.slice(10)}`,
    );
    expect(String(decoded.to).toLowerCase()).toBe(recipient.toLowerCase());
    expect(decoded.value).toBe(42n);
  });

  it("signs and decodes a native transaction offline", async () => {
    const signed = await web3.qrl.accounts.signTransaction(
      { ...transaction, to: recipient, value: 123n, gasLimit: 21000 },
      sender.seed,
    );
    const decoded = FeeMarketEIP1559Transaction.fromSerializedTx(
      web3.utils.hexToBytes(signed.rawTransaction),
    );
    expect(decoded.verifySignature()).toBe(true);
    expect(decoded.to?.toString().toLowerCase()).toBe(recipient.toLowerCase());
    expect(decoded.getSenderAddress().toString().toLowerCase()).toBe(
      sender.address.toLowerCase(),
    );
    expect(web3.qrl.accounts.recoverTransaction(signed.rawTransaction)).toBe(
      sender.address,
    );
    expect(decoded.value).toBe(123n);
    expect(decoded.nonce).toBe(7n);
    expect(decoded.chainId).toBe(1n);
    expect(decoded.data).toHaveLength(0);
    expect(decoded.signature).toHaveLength(4627);
    expect(decoded.publicKey).toHaveLength(2592);
    expect(web3.utils.bytesToHex(decoded.hash())).toBe(signed.transactionHash);
  });

  it("signs and decodes a QRC20 transfer offline", async () => {
    const contract = new web3.qrl.Contract(
      ZRC_20_CONTRACT_ABI,
      contractAddress,
    );
    const data = contract.methods.transfer(recipient, 42n).encodeABI();
    const signed = await sender.signTransaction({
      ...transaction,
      to: contractAddress,
      data,
      value: 0,
    });
    const decoded = FeeMarketEIP1559Transaction.fromSerializedTx(
      web3.utils.hexToBytes(signed.rawTransaction),
    );
    expect(decoded.verifySignature()).toBe(true);
    expect(decoded.to?.toString().toLowerCase()).toBe(
      contractAddress.toLowerCase(),
    );
    expect(web3.qrl.accounts.recoverTransaction(signed.rawTransaction)).toBe(
      sender.address,
    );
    expect(decoded.getSenderAddress().toString().toLowerCase()).toBe(
      sender.address.toLowerCase(),
    );
    expect(decoded.value).toBe(0n);
    const decodedData = web3.utils.bytesToHex(decoded.data);
    expect(decodedData).toBe(data);
    const args = web3.qrl.abi.decodeParameters(
      transferAbi.inputs,
      `0x${decodedData.slice(10)}`,
    );
    expect(String(args.to).toLowerCase()).toBe(recipient.toLowerCase());
    expect(args.value).toBe(42n);
  });

  it("encodes an NFT transfer with full sender and recipient addresses", () => {
    const contract = new web3.qrl.Contract(
      ZRC_721_CONTRACT_ABI,
      contractAddress,
    );
    const data = contract.methods
      .safeTransferFrom(sender.address, recipient, 9n)
      .encodeABI();
    const decoded = web3.qrl.abi.decodeParameters(
      ["address", "address", "uint256"],
      `0x${data.slice(10)}`,
    );
    expect(String(decoded[0]).toLowerCase()).toBe(sender.address.toLowerCase());
    expect(String(decoded[1]).toLowerCase()).toBe(recipient.toLowerCase());
    expect(decoded[2]).toBe(9n);
  });

  it("verifies personal and typed-data signatures with the wallet.js 6 signing context", () => {
    const wallet = MLDSA87.newWalletFromExtendedSeed(new ExtendedSeed(seed));
    const typedData = {
      types: {
        QRLTypedDataDomain: [{ name: "verifyingContract", type: "address" }],
        Transfer: [{ name: "to", type: "address" }],
      },
      primaryType: "Transfer",
      domain: { verifyingContract: contractAddress },
      message: { to: recipient },
    };
    const typedHash = getEncodedQRLTypedData(typedData, true);
    for (const data of ["Test-only personal message", typedHash]) {
      const signed = web3.qrl.accounts.sign(data, sender.seed);
      expect(
        MLDSA87.verify(
          web3.utils.hexToBytes(signed.signature),
          web3.utils.hexToBytes(signed.messageHash),
          wallet.getPK(),
          wallet.getDescriptor(),
        ),
      ).toBe(true);
    }
    wallet.zeroize();
  });
});
