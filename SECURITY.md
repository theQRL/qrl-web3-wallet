# Security Policy — QRL Web3 Wallet

Thank you for taking the time to help make the QRL Web3 Wallet safer.

## Reporting a vulnerability

**Please do not open a public GitHub issue.** Vulnerabilities should be reported privately so that a fix can ship before details are public.

Preferred channels (in order):

1. Email: `security@theqrl.org`
2. GitHub Security Advisories: <https://github.com/theQRL/qrl-web3-wallet/security/advisories/new>

Please include:

- A clear description of the issue and the conditions required to trigger it.
- A proof of concept if you have one (source files, reproducer steps, a short video, or a hosted page).
- The wallet version / commit hash you tested.
- Your browser and OS.
- Any suggested mitigation.

We'll acknowledge within 3 business days and aim to send a first assessment within 7.

## Scope

### In scope

- The extension code in this repository.
- The approval UI flow for any JSON-RPC method listed in `ALL_REQUEST_METHODS` (`src/scripts/constants/requestConstants.ts`).
- Key management: keystore encryption/decryption, lock/unlock, auto-lock, Web Worker lifecycle.
- Content-script ↔ service-worker bridge.
- Ledger hardware-wallet integration assuming a well-behaved device (faulty/malicious devices are out of scope for severity purposes, but robustness hardening is welcome).

### Out of scope

- Attacks requiring arbitrary code execution on the user's machine.
- Attacks requiring a malicious or compromised Ledger device (we accept these may produce malformed transactions that the network rejects; severity is limited to denial of service).
- Timing / power / EM side-channel attacks against the ML-DSA-87 implementation. That's upstream in `@theqrl/wallet.js`; please report those there.
- Phishing-list gaps (fresh domains, subdomain-only attacks). The phishing detector is defense-in-depth.
- UX issues that are not safety-affecting (button placement, typos not in security-sensitive strings, etc.).
- Third-party dependency CVEs unless they are reachable from wallet code.
- The remote QRL RPC node. Signed transactions are authenticated end-to-end by consensus; RPC-level lies can at worst mislead UI reads.
- Social engineering against the user outside the extension surface.

## What we classify as High

- Any path that causes a signed-and-broadcast transaction whose content (to, value, data, chainId, or any signable field) differs from what the user sees in the approval popup.
- Any path that discloses or exfiltrates plaintext mnemonic, seed, or keystore password.
- Any path that bypasses the approval popup for methods in `RESTRICTED_METHODS` (`src/scripts/constants/requestConstants.ts:47-58`) and causes a signature to be produced.
- Any path that causes incorrect origin attribution in approval UI or permission storage (i.e., dApp A getting permissions recorded under dApp B's origin).

## What we classify as Medium

- Cross-dApp interference via global state (e.g., active chain).
- Denial of service that makes the wallet unusable for restricted methods until manual recovery.
- Correctness / spec-compliance failures in EIP-712 / EIP-1193 / EIP-5792 handling that could lead dApps to mis-report state.

## What we classify as Low

- Privacy leaks that depend on dApp-controlled content (e.g., image-preload network pings before approval).
- Hardening / defense-in-depth opportunities against non-threat-model actors (e.g., malicious hardware device robustness).
- Supply-chain hygiene (unpinned dependencies) where no exploit currently exists.

## Known limitations (not accepting reports on these)

- **Single-popup approval serialisation.** The wallet processes one approval at a time via `isRequestPending`. This is a known simplification; race-to-first rejection and double-click protection are implemented at the UI layer.
- **No explicit memory zeroing of plaintext.** JS engines don't guarantee zeroed-on-free; this is inherent to the runtime.
- **Keep-alive alarm defeats Chrome's idle SW kill.** Deliberate; the auto-lock alarm provides the actual idle timeout.

## Coordinated disclosure

- We prefer 90 days from confirmed report to public disclosure.
- For serious issues we'll try to release a patch version ahead of public disclosure and give you co-author credit on the release notes (if you want it).
- Please avoid testing on third-party dApps without their permission. A local or self-hosted dApp is sufficient for every reproducer.

## Recognition

We don't currently operate a paid bug bounty, but we will publicly credit responsible reporters (unless you prefer anonymity).

## Out-of-cycle updates

Security fixes land on `main` behind a clear commit message and a version bump. Extension auto-updates propagate within ~24 hours for Chrome Web Store users; unpacked installations need manual rebuild and reload.

---

Last updated: see git log.
