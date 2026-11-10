import type Web3 from "@theqrl/web3";
import { getSerializableObject } from "./scriptUtils";

type Qrl = Web3["qrl"];

/**
 * @theqrl/web3 2.0.0 refuses `gasPrice` and a `gas` that differs from
 * `gasLimit`. 1.x sent the node the request without `gasPrice`, and with the
 * value of `gasLimit` when both gas fields were present; the same request
 * goes through web3's own call and estimateGas wrappers here.
 */
const dropRejectedFields = <T>(transactionObject: T): T => {
  if (typeof transactionObject !== "object" || transactionObject === null) {
    return transactionObject;
  }
  const { gasPrice: _gasPrice, ...rest } = transactionObject as Record<
    string,
    unknown
  >;
  if (rest.gas !== undefined && rest.gasLimit !== undefined) {
    rest.gas = rest.gasLimit;
  }
  return rest as T;
};

export const estimateGasForDapp = async (
  qrl: Qrl,
  transactionObject: Parameters<Qrl["estimateGas"]>[0],
) =>
  "0x".concat(
    (await qrl.estimateGas(dropRejectedFields(transactionObject))).toString(16),
  );

export const callForDapp = (
  qrl: Qrl,
  transactionObject: Parameters<Qrl["call"]>[0],
  blockParam?: Parameters<Qrl["call"]>[1],
) => qrl.call(dropRejectedFields(transactionObject), blockParam);

/** 2.0.0 reports sync progress as BigInt values; a dApp needs JSON quantities. */
export const getSyncingResult = async (qrl: Web3["qrl"]) =>
  getSerializableObject(await qrl.isSyncing());
