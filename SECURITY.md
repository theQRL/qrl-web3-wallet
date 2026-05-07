# Security Policy — QRL Web3 Wallet

Thank you for taking the time to help make the QRL Web3 Wallet safer.

You can read more about the QRL's security program at [theqrl.org/security-report](https://theqrl.org/security-report/).

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

If in doubt, report privately. We will triage and determine scope and severity internally.
