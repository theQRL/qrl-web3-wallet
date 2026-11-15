import { qrl } from "@theqrl/web3";

/**
 * Check if input looks like a QRNS name (e.g. alice.qrl, sub.alice.qrl).
 */
export function isQrnsName(input: string): boolean {
  return /^[a-z0-9.-]+\.qrl$/i.test(input.trim());
}

/**
 * Resolve a QRNS name to a Q-address using on-chain lookup.
 * Throws if resolution fails (no contract, name not registered, network error).
 */
export async function resolveQrnsName(
  name: string,
  rpcUrl: string,
  registryAddress?: string,
): Promise<string> {
  const qrns = new qrl.qrns.QRNS(registryAddress, rpcUrl);
  const addr = await qrns.getAddress(name);
  // Convert 0x-prefixed address to Q-prefixed
  if (addr.startsWith("0x")) {
    return "Q" + addr.slice(2);
  }
  return addr;
}
