/**
 * A send request carries its call data as `data`, as `input`, or as both
 * with the same bytes. `input` is the newer name, and the one the library's
 * contract calls use. The approval reads `data`, so a request is stored for
 * it with the call data under that name and no `input` beside it.
 */

const field = (transaction: unknown, name: "data" | "input"): unknown => {
  if (typeof transaction !== "object" || transaction === null) return undefined;
  const value: unknown = Reflect.get(transaction, name);
  return value ?? undefined;
};

/** What is wrong with the call data of a send request, if anything is. */
export const callDataProblem = (transaction: unknown): string | undefined => {
  const data = field(transaction, "data");
  const input = field(transaction, "input");
  if (input === undefined) return undefined;
  if (typeof input !== "string") return '"input" has to be a hex string';
  if (
    data !== undefined &&
    (typeof data !== "string" || data.toLowerCase() !== input.toLowerCase())
  ) {
    return '"data" and "input" are both set and differ';
  }
  return undefined;
};

/** True for a transaction that still names call data as `input`. */
export const hasInputField = (transaction: unknown): boolean =>
  field(transaction, "input") !== undefined;

/**
 * The transaction with its call data as `data` and without `input`. A
 * transaction with a call data problem comes back as it is; a request with
 * one is refused before it gets this far.
 */
export const withCallDataAsData = (transaction: unknown): unknown => {
  if (
    typeof transaction !== "object" ||
    transaction === null ||
    !("input" in transaction) ||
    callDataProblem(transaction) !== undefined
  ) {
    return transaction;
  }
  const { input, ...rest } = transaction;
  if (typeof input !== "string") return rest;
  return field(rest, "data") === undefined ? { ...rest, data: input } : rest;
};

/** What the approval answers for a stored request it must not sign. */
export const UNREAD_INPUT_MESSAGE =
  'The request names call data as "input", which the approval does not read';
