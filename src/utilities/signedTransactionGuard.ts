import { recoverTransaction } from "@theqrl/web3-qrl-accounts";

export const assertSignedTransactionSender = (
  rawTransaction: string,
  expectedFrom: string,
): void => {
  const recoveredSender = recoverTransaction(rawTransaction);
  if (!expectedFrom || recoveredSender.toLowerCase() !== expectedFrom.toLowerCase()) {
    throw new Error(
      `Signed transaction sender mismatch. expected=${expectedFrom} recovered=${recoveredSender}`,
    );
  }
};
