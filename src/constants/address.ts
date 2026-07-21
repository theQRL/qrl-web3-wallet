export const QRL_ADDRESS_PREFIX = "Q";
export const QRL_ADDRESS_BYTES = 64;
export const QRL_ADDRESS_HEX_LENGTH = QRL_ADDRESS_BYTES * 2;
export const QRL_ADDRESS_LENGTH = QRL_ADDRESS_PREFIX.length + QRL_ADDRESS_HEX_LENGTH;

export const QRL_ZERO_ADDRESS =
  `${QRL_ADDRESS_PREFIX}${"0".repeat(QRL_ADDRESS_HEX_LENGTH)}` as const;

const expandLegacyFixture = (suffix: string) =>
  `${"0".repeat(96 - suffix.length)}${suffix}`.toLowerCase().padEnd(
    QRL_ADDRESS_HEX_LENGTH,
    "0",
  );

export const QRL_EXAMPLE_ADDRESS =
  `${QRL_ADDRESS_PREFIX}${expandLegacyFixture("8A8eAFb1cf62BfBeb1741769DAE1a9dd47996192")}`;

export const QRL_EXAMPLE_ADDRESS_2 =
  `${QRL_ADDRESS_PREFIX}${expandLegacyFixture("fB08fF1f1376A14C055E9F56df80563E16722b")}`;

export const QRL_EXAMPLE_ADDRESS_3 =
  `${QRL_ADDRESS_PREFIX}${expandLegacyFixture("201BdF510d5aa66d1b5DB98dFB0f30D40b6Ea47D")}`;
