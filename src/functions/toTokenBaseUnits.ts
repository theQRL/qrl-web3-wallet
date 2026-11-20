// A uint256 has 78 decimal digits. An amount with more is no token amount.
const MAX_BASE_UNIT_DIGITS = 78;

/** One quanta is 10 ** 18 planck, as in the library's unit map. */
export const QUANTA_DECIMALS = 18;

/**
 * Converts a token amount to the token's base units with integer arithmetic.
 *
 * Multiplying in floating point is not exact: `1.1 * 10 ** 18` is
 * 1100000000000000128, and `0.07 * 10 ** 2` is 7.000000000000001, which is
 * no integer at all.
 *
 * The amount is read as decimal text. The send form hands over the text as
 * it was typed, and that is converted digit for digit. A number is read
 * from its shortest decimal form, which names every amount of up to 15
 * significant digits as it was typed.
 *
 * The work is bounded by the length of the text: an exponent, however
 * large, moves the decimal point and builds no number of that size.
 *
 * @throws RangeError for an amount that is no decimal number of zero or
 * more, for one with more decimal places than the token has, and for one
 * too large for a uint256.
 */
export const toTokenBaseUnits = (
  amount: number | string,
  decimals: number,
): bigint => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError("The token's decimals must be a whole number");
  }

  // "1.1", "7", ".5", "1e+21" and "1.5e-7" are the forms an amount takes
  // as text. A sign, a blank or a letter makes it no amount.
  const text = typeof amount === "number" ? amount.toString() : amount.trim();
  const parts = /^(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  const [, whole = "", fraction = "", exponent = "0"] = parts ?? [];
  if (parts === null || whole + fraction === "") {
    throw new RangeError("The amount must be a number of zero or more");
  }

  // The significant digits, and how far the decimal point moves to the
  // right of them to reach base units.
  const digits = (whole + fraction).replace(/^0+/, "");
  if (digits === "") return 0n;
  const shift = decimals + Number(exponent) - fraction.length;
  if (shift >= 0) {
    if (digits.length + shift > MAX_BASE_UNIT_DIGITS) {
      throw new RangeError("The amount is too large");
    }
    return BigInt(digits) * 10n ** BigInt(shift);
  }

  // The point moves to the left: the digits it passes have to be zeros.
  const kept = digits.length + shift;
  if (kept < 0 || /[1-9]/.test(digits.slice(Math.max(kept, 0)))) {
    throw new RangeError(
      `The amount has more than ${decimals.toString()} decimal places`,
    );
  }
  if (kept > MAX_BASE_UNIT_DIGITS) {
    throw new RangeError("The amount is too large");
  }
  return BigInt(digits.slice(0, kept) || "0");
};

/** Converts an amount of the native coin, in quanta, to planck. */
export const quantaToPlanck = (amount: number | string): bigint =>
  toTokenBaseUnits(amount, QUANTA_DECIMALS);
