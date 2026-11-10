import type Web3 from "@theqrl/web3";
import { Web3RequestManager } from "@theqrl/web3-core";
import { getSerializableObject } from "./scriptUtils";

type Provider = ConstructorParameters<typeof Web3RequestManager>[0];

/**
 * @theqrl/web3 2.0.0 refuses `gasPrice` and a `gas` that differs from
 * `gasLimit` before the request leaves the wallet. A dApp gets the node's
 * own answer for these calls, as it did on 1.x, so the object is forwarded
 * unchanged.
 */
export const forwardEstimateGas = (
  provider: Provider,
  transactionObject: unknown,
): Promise<unknown> =>
  new Web3RequestManager(provider).send({
    method: "qrl_estimateGas",
    params: [transactionObject],
  });

export const forwardCall = (
  provider: Provider,
  transactionObject: unknown,
  blockParam?: unknown,
): Promise<unknown> =>
  new Web3RequestManager(provider).send({
    method: "qrl_call",
    params: [transactionObject, blockParam ?? "latest"],
  });

/** 2.0.0 reports sync progress as BigInt values; a dApp needs JSON quantities. */
export const getSyncingResult = async (qrl: Web3["qrl"]) =>
  getSerializableObject(await qrl.isSyncing());
