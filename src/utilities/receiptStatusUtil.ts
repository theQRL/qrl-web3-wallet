export type ReceiptStatus = boolean | string | number | bigint | null | undefined;

export const isSuccessfulReceiptStatus = (status: ReceiptStatus): boolean => {
  if (status === true) return true;
  if (status === false || status == null) return false;
  if (typeof status === "bigint" || typeof status === "number") {
    return status === 1 || status === BigInt(1);
  }

  const normalized = status.trim().toLowerCase();
  return normalized === "1" || normalized === "0x1" || normalized === "true";
};
