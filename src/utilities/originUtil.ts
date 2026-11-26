/**
 * Derives the security origin of a request URL.
 *
 * WHY THIS IS SHARED RATHER THAN INLINED
 * -------------------------------------
 * `new URL(url).origin` serialises an *opaque* origin — `file://`, a sandboxed
 * iframe, a `data:` URL — to the literal string `"null"`. That is a string like
 * any other, so it happily becomes a storage key: grants written under it are
 * shared by every unrelated opaque context, and a permission prompt seeded from
 * it can offer accounts that belong to somebody else. Every derivation must map
 * it to `""` and fail closed. See CIPH-QRLW326-31.
 *
 * Getting that right in one place and wrong in another is the realistic failure,
 * so both the service-worker middlewares and the approval-screen store call this
 * function rather than each computing an origin of their own. See
 * CIPH-QRLW326-39.
 */

/**
 * Returns the origin of `url`, or `""` when the URL is absent, unparseable, or
 * carries an opaque origin. An empty result means *unidentifiable* and must
 * never be treated as a valid grant key.
 */
export const getRequestOrigin = (url: string | undefined): string => {
  try {
    const origin = new URL(url ?? "").origin;
    return origin === "null" ? "" : origin;
  } catch {
    return "";
  }
};
