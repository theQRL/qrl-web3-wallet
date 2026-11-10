const HEX_MESSAGE = /^0[xX][0-9a-fA-F]*$/;

/**
 * The 1.x wallet hashed a text message after dropping its leading and
 * trailing NUL characters. @theqrl/web3 2.0.0 keeps them, which changes the
 * signed digest of such a message. Hex messages are passed through as given.
 */
export function toPersonalSignInput(message: string) {
  return HEX_MESSAGE.test(message)
    ? message
    : message.replace(/^\u0000+|\u0000+$/g, "");
}
