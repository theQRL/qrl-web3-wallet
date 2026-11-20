/**
 * QRL 2.0 has a single transaction type, 0x2, and the library signs nothing
 * else. A dApp request names that type or leaves the type out.
 */
export const isSupportedTransactionType = (type: unknown): boolean =>
  type === undefined ||
  type === null ||
  type === 2 ||
  (typeof type === "string" && /^0x0*2$/i.test(type));

/** What a request that names another type is told. */
export const unsupportedTransactionTypeMessage = (type: unknown): string =>
  `QRL transactions are of type 0x2. Received type: ${JSON.stringify(type)}`;
