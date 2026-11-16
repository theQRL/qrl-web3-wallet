/**
 * Names in stored data that changed when the token standards were renamed
 * from ZRC to QRC. Data written by an earlier version is read under its old
 * names here and returned under the current ones, so a user's history,
 * transfer draft and NFT collections stay visible. The storage holds the
 * current names from the next write on.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const EARLIER_TOKEN_FLAG = "isZrc20Token";
const TOKEN_FLAG = "isQrc20Token";

const EARLIER_NFT_STANDARDS = new Map([
  ["ZRC721", "QRC721"],
  ["ZRC1155", "QRC1155"],
]);

/** Moves the earlier token flag to its current name. A current flag wins. */
const withCurrentTokenFlag = (stored: unknown): unknown => {
  if (!isRecord(stored) || !(EARLIER_TOKEN_FLAG in stored)) return stored;
  const { [EARLIER_TOKEN_FLAG]: earlier, ...rest } = stored;
  return TOKEN_FLAG in rest ? rest : { ...rest, [TOKEN_FLAG]: earlier };
};

/** A transaction history entry as stored, under the current names. */
export const readStoredHistoryEntry = (stored: unknown): unknown =>
  withCurrentTokenFlag(stored);

/** A transfer draft as stored, under the current names; {} when none is stored. */
export const readStoredTransferDraft = (
  stored: unknown,
): Record<string, unknown> => {
  if (!isRecord(stored)) return {};
  return "tokenDetails" in stored
    ? { ...stored, tokenDetails: withCurrentTokenFlag(stored.tokenDetails) }
    : stored;
};

/** An imported NFT collection as stored, with the current standard name. */
export const readStoredNftCollection = (stored: unknown): unknown => {
  if (!isRecord(stored) || typeof stored.standard !== "string") return stored;
  const current = EARLIER_NFT_STANDARDS.get(stored.standard);
  return current === undefined ? stored : { ...stored, standard: current };
};
