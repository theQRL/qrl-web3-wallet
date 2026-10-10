# Contributing

```sh
npm ci
npm run lint
npm test
```

## Lint rules

`npm run lint` runs type-aware typescript-eslint with the `strictTypeChecked` preset, plus four rules at `error`:

- `@typescript-eslint/consistent-type-assertions` with `assertionStyle: "never"` (`as const` stays allowed)
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-non-null-assertion`
- `@typescript-eslint/ban-ts-comment` (`@ts-expect-error` needs a description)

Why: this wallet handles input that the compiler cannot see. Messages from dApps, values read from extension storage and messages passed through the service worker all arrive as `unknown`. A cast tells the compiler a shape that nobody checked. A runtime guard (a type predicate, a zod schema, a `typeof` check) checks it and narrows the type as a result, so the type matches what the code received.

Test files are exempt from the assertion, `any`, non-null and `no-unsafe-*` rules, since they feed malformed input and mock internals on purpose.

## The ratchet

Existing code does not satisfy every rule yet. `eslint.ratchet.js` lists, per rule, the files that violate it today, and `eslint.config.js` switches the rule off for exactly those files. All other files, including every new file, are held to the full rule set.

To shrink the list:

1. Pick a file in `eslint.ratchet.js` and fix the violations for one rule.
2. Delete the file from that rule's list.
3. Run `npm run lint`. It must exit 0.

The list only ever gets shorter. A violation in a new file gets fixed in that file.

The type-aware rules cover the files in `tsconfig.json` plus `vite.config.ts`. `vitest.config.ts` belongs to no tsconfig project, so it stays outside them until it joins one.
