> [!NOTE]
> This code relates to QRL v2.0 Testnet.  This extension is not suitable for current QRL Mainnet (v1).  See [theqrl.org](https://theqrl.org) for release announcements.


![QRL Web3 Wallet Preview Cover](misc/zond_web3_wallet_preview_cover.png)

# QRL Web3 Wallet

A wallet for creating accounts, importing accounts and sending transactions over the QRL blockchain. This is an extension for Chromium-based web browsers (Chrome, Brave, Edge, Vivaldi), for performing operations on the [QRL](https://www.theqrl.org/) blockchain.

## :package: Install (recommended for users)

The pre-built extension is published as a `.zip` on every tagged release. To install:

1. Open the [latest release](https://github.com/theQRL/qrl-web3-wallet/releases/latest) page.
2. Under **Assets**, download `qrl-web3-wallet-chrome-vX.Y.Z.zip`.
3. Unzip the file. You'll get a folder named `qrl-web3-wallet-chrome-vX.Y.Z/`.
4. Open Chrome and navigate to `chrome://extensions`.
5. Toggle **Developer mode** on (top-right).
6. Click **Load unpacked** and select the unzipped folder from step 3.
7. The QRL Web3 Wallet icon appears in your browser toolbar and can be pinned for easy access.

The same flow works on Brave, Edge, Vivaldi, and other Chromium-based browsers. Firefox is not currently supported.

> Releases are signed and tagged by the project's release pipeline. Always download from the official `theQRL/qrl-web3-wallet` GitHub releases page. **Never** download or install from a third-party mirror.

> [!WARNING]
> **Seeing a "Manifest file is missing or unreadable" error?**
>
> You're loading the wrong folder. Read the instructions again.
>
> - **If you downloaded the release zip**: make sure you selected the **unzipped folder** (e.g. `qrl-web3-wallet-chrome-v0.2.0/`) — not the `.zip` file itself, and not a parent directory.
> - **If you cloned the repo**: the project root is *not* a loadable extension. Run `npm run build` first, then load the generated `Extension/` folder: see below.

## :keyboard: Build from source (for developers)

Building from source produces the same `Extension/` folder that's published on the release page. The CI pipeline (`.github/workflows/release.yml`) uses these steps.

### Prerequisites

- Node.js 22.x ([nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) recommended)
- npm
- git

### Build the extension

```sh
git clone https://github.com/theQRL/qrl-web3-wallet.git
cd qrl-web3-wallet
npm install
npm run build
```

Output is to the `Extension/` folder. Load it in Chrome via `chrome://extensions` → **Developer mode** → **Load unpacked**, and select the `Extension/` folder.

### Development with watch mode

```sh
npm run dev
```

Rebuilds `Extension/` on every source change. Reload the extension in Chrome (`chrome://extensions` → reload icon next to the wallet entry) to pick up changes.

### Tests and lint

```sh
npm test       # vitest run
npm run lint   # eslint
```

## :dna: Features list

| Feature              | Description                                                                                                                                                                                                                                           | Related files                                                                                                                                                                                                                                                               | Status         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Extension manifest   | Source manifest template that Vite reads at build time, transforms (injects version), and emits to `Extension/manifest.json`. Kept under `src/` so the repo root cannot be mistakenly loaded as an unpacked extension. | [src/manifest.json](src/manifest.json)                                                                                                                                                                                                                                              | :green_circle: |
| Theming              | Based on the system theme, extension will be displayed in light or dark theme.                                                                                                                                                                        | [index.css](src/index.css) [tailwind.config.js](tailwind.config.js)                                                                                                                                                                                                         | :green_circle: |
| Blockchain selection | The user can connect the wallet to a local QRL node, QRL testnet or QRL mainnet. Mainnet can be used for real transactions, and the other two can be used for testing and demo.                                                                       | [ChainBadge.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Wallet/Header/ChainBadge/ChainBadge.tsx)                                                                                                                                                                         | :green_circle: |
| Create account       | The user can create a new account just with the click of a button. The newly created account address along with its secret recovery phrases will be presented to the user for download.                                                              | [CreateAccount.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/CreateAccount/CreateAccount.tsx)                                                                                                                                                                  | :green_circle: |
| Import account       | If the user has recovery phrases of an account created in the past, that account can be imported to the wallet.                                                                                                                                       | [ImportAccount.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ImportAccount/ImportAccount.tsx)                                                                                                                                                                  | :green_circle: |
| Account list         | List of accounts created or imported are stored locally, and displayed to the user. The user can switch to a different account in the wallet.                                                                                                         | [AccountList.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/AccountList.tsx)                                                                                                                                                                        | :green_circle: |
| User Password        | Ideally, the user entered password should be used to encrypt the account recovery phrases, so that the user can use their password for transactions each time. This needs to be first implemented in the QRL web3.js library.                         | [Lock.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Lock/Lock.tsx) [lockManager.ts](src/scripts/lockManager/lockManager.ts)                                                                                                                                                | :green_circle: |
| Transaction          | The user can send `QRL` to other addresses. The receiver's account address, the amount and the user's secret mnemonic phrases (user's password will be used in the future) are required to make the transaction.                                     | [TokenTransfer.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/TokenTransfer/TokenTransfer.tsx)                                                                                                                                                                  | :green_circle: |
| Gas Fee              | Before making a transaction, the user can see an estimated gas fee amount.                                                                                                                                                                            | [GasFeeNotice.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/TokenTransfer/GasFeeNotice/GasFeeNotice.tsx)                                                                                                                                                       | :green_circle: |
| Wallet connect       | Online dApps present the user with a `Connect` button. To connect the wallet with the dApps, multi-wallet support based on EIP-6963 is implemented.                                                                                                   | [DAppRequest.tsx](src/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequest.tsx) [middlewares](src/scripts/middlewares) [inPageScript.ts](src/scripts/inPageScript.ts)                                                                                              | :green_circle: |
| ZRC-20 Tokens        | The wallet supports `ZRC-20` tokens. The users can import and send the ZRC-20 tokens from the wallet.                                                                                                                                                 | [ImportToken.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ImportToken/ImportToken.tsx) [TokensCardContent.tsx](src/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/AccountCreateImport/ActiveAccountDisplay/TokensCardContent/TokensCardContent.tsx)    | :green_circle: |

## :hammer_and_wrench: Built with

[The QRL](https://github.com/theQRL/QRL), [Vite](https://vitejs.dev/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vitest](https://vitest.dev/), [MobX](https://mobx.js.org/README.html), [Shadcn](https://ui.shadcn.com/), [React Hook Form](https://www.react-hook-form.com/), [TailwindCSS](https://tailwindcss.com/), and [@theqrl/qrl-wallet-provider](https://github.com/theQRL/qrl-wallet-provider) for EIP-1193 / EIP-6963 dApp connectivity.
