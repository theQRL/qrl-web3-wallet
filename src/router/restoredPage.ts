/**
 * Paths an earlier build saved as the last open page, mapped to the path the
 * same screen has now. The wallet reopens on the saved page, so a renamed
 * route has to stay reachable under its earlier name: an unknown path matches
 * no screen, leaves the wallet body empty and is saved again on every open.
 */
const EARLIER_PATHS: ReadonlyMap<string, string> = new Map([
  ["/all-zrc-20-tokens", "/all-qrc-20-tokens"],
]);

/** The path to open for a saved last page. */
export const restoredPage = (savedPath: string): string =>
  EARLIER_PATHS.get(savedPath) ?? savedPath;
