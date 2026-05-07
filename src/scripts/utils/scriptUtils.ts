import browser from "webextension-polyfill";

/**
 * Returns an Error if extension.runtime.lastError is present
 * this is a workaround for the non-standard error object that's used
 *
 * According to the docs, we are expected to check lastError in runtime API callbacks:
 * "
 * If you call an asynchronous function that may set lastError, you are expected to
 * check for the error when you handle the result of the function. If lastError has been
 * set and you don't check it within the callback function, then an error will be raised.
 * "
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/lastError}
 */
export function checkForLastError() {
  const { lastError } = browser.runtime;
  if (!lastError) {
    return undefined;
  }

  // @ts-expect-error - lastError may have a stack property not declared in webextension-polyfill types
  // if it quacks like an Error, its an Error
  if (lastError.stack && lastError.message) {
    return lastError;
  }
  // repair incomplete error object (eg chromium v77)
  return new Error(lastError.message);
}

/**
 * Strips internal fields (notably `stack`) from an error before it is forwarded
 * to a dApp. Preserves the JSON-RPC-relevant fields `code`, `message`, and
 * `data`. Stack traces leak bundled-library file hashes that fingerprint the
 * exact `@theqrl/zond-wallet-provider` version (P-7b).
 */
function sanitizeError(error: unknown): {
  code?: number;
  message?: string;
  data?: unknown;
} {
  if (error && typeof error === "object") {
    const e = error as { code?: number; message?: string; data?: unknown };
    return {
      ...(typeof e.code === "number" && { code: e.code }),
      message: typeof e.message === "string" ? e.message : String(error),
      ...(e.data !== undefined && { data: e.data }),
    };
  }
  return { message: String(error) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSerializableObject(jsonObject: any) {
  if (jsonObject?.error) {
    return { error: sanitizeError(jsonObject.error) };
  }
  return JSON.parse(
    JSON.stringify(jsonObject, (_, value) => {
      if (typeof value === "bigint") {
        return "0x".concat(value.toString(16));
      }
      return value;
    }),
  );
}
