import type Web3 from "@theqrl/web3";
import { getSerializableObject } from "./scriptUtils";

type Qrl = Web3["qrl"];

const isObject = (value: unknown): value is object =>
  typeof value === "object" && value !== null;

/**
 * Since 2.0.0, @theqrl/web3 refuses `gasPrice` and a `gas` that differs from
 * `gasLimit`. 1.x sent the node the request without `gasPrice`, and with the
 * value of `gasLimit` when both gas fields were present; the same request
 * goes through web3's own call and estimateGas wrappers here.
 *
 * A dApp sends this object, so it can hold `gasPrice` although the web3
 * transaction type has no such field, and it can be something else entirely.
 * Anything that is not an object goes to web3 unchanged and fails there.
 */
const dropRejectedFields = <T extends Parameters<Qrl["estimateGas"]>[0]>(
  transactionObject: T & { gasPrice?: unknown },
) => {
  if (!isObject(transactionObject)) {
    return transactionObject;
  }
  const { gasPrice: _gasPrice, ...rest } = transactionObject;
  return transactionObject.gas !== undefined &&
    transactionObject.gasLimit !== undefined
    ? { ...rest, gas: transactionObject.gasLimit }
    : rest;
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

/** Since 2.0.0, sync progress comes as BigInt values; a dApp needs JSON quantities. */
export const getSyncingResult = async (qrl: Qrl): Promise<unknown> =>
  getSerializableObject(await qrl.isSyncing());

/**
 * A transaction by its position in a block, in the form a dApp can receive.
 * The lookup is awaited here: a pending promise serializes to an empty
 * object, which is what dApps got for both request methods.
 */
export const getTransactionFromBlockForDapp = async (
  qrl: Qrl,
  blockHashOrNumber: Parameters<Qrl["getTransactionFromBlock"]>[0],
  transactionIndex: Parameters<Qrl["getTransactionFromBlock"]>[1],
): Promise<unknown> =>
  getSerializableObject(
    await qrl.getTransactionFromBlock(blockHashOrNumber, transactionIndex),
  );
