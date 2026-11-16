import withSuspense from "@/functions/withSuspense";
import { lazy } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

const QrlWeb3Wallet = withSuspense(
  lazy(() => import("@/components/QrlWeb3Wallet/QrlWeb3Wallet")),
);
const Home = withSuspense(
  lazy(
    () =>
      import("@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Home/Home"),
  ),
);
const CreateAccount = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/CreateAccount/CreateAccount"
      ),
  ),
);
const ImportAccount = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ImportAccount/ImportAccount"
      ),
  ),
);
const ImportToken = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ImportToken/ImportToken"
      ),
  ),
);
const AllQRC20Tokens = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AllQRC20Tokens/AllQRC20Tokens"
      ),
  ),
);
const AccountList = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/AccountList/AccountList"
      ),
  ),
);
const DAppConnectivity = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/DAppConnectivity/DAppConnectivity"
      ),
  ),
);
const EditDAppConnectedAccounts = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/DAppConnectivity/ConnectivityWithWallet/DAppConnected/DAppConnectedAccounts/EditDAppConnectedAccounts/EditDAppConnectedAccounts"
      ),
  ),
);
const EditDAppConnectedBlockchains = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/DAppConnectivity/ConnectivityWithWallet/DAppConnected/DAppConnectedBlockchains/EditDAppConnectedBlockchains/EditDAppConnectedBlockchains"
      ),
  ),
);
const ChainConnectivity = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ChainConnectivity/ChainConnectivity"
      ),
  ),
);
const AddEditChain = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ChainConnectivity/NewChain/AddEditChain/AddEditChain"
      ),
  ),
);
const TokenTransfer = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/TokenTransfer/TokenTransfer"
      ),
  ),
);
const ImportLedger = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ImportLedger/ImportLedger"
      ),
  ),
);
const TransactionHistory = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/TransactionHistory/TransactionHistory"
      ),
  ),
);
const TransactionDetail = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/TransactionHistory/TransactionDetail/TransactionDetail"
      ),
  ),
);
const ContactsPage = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Contacts/ContactsPage"
      ),
  ),
);
const Settings = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Settings/Settings"
      ),
  ),
);
const SettingsAppearance = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Settings/SettingsAppearance"
      ),
  ),
);
const SettingsSecurity = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Settings/SettingsSecurity"
      ),
  ),
);
const SettingsPreferences = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Settings/SettingsPreferences"
      ),
  ),
);
const SettingsData = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Settings/SettingsData"
      ),
  ),
);
const SettingsAbout = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Settings/SettingsAbout"
      ),
  ),
);
const ImportNFTCollection = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/ImportNFTCollection/ImportNFTCollection"
      ),
  ),
);
const NFTGallery = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/NFTGallery/NFTGallery"
      ),
  ),
);
const NFTDetail = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/NFTDetail/NFTDetail"
      ),
  ),
);
const NFTTransfer = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/NFTTransfer/NFTTransfer"
      ),
  ),
);
const Receive = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Body/Receive/Receive"
      ),
  ),
);

export const ROUTES = {
  HOME: "/",
  CREATE_ACCOUNT: "/create-account",
  IMPORT_ACCOUNT: "/import-account",
  IMPORT_LEDGER: "/import-ledger",
  IMPORT_TOKEN: "/import-token",
  IMPORT_NFT_COLLECTION: "/import-nft-collection",
  NFT_GALLERY: "/nft-gallery",
  NFT_DETAIL: "/nft-detail",
  NFT_TRANSFER: "/nft-transfer",
  ALL_QRC_20_TOKENS: "/all-qrc-20-tokens",
  TOKEN_TRANSFER: "/token-transfer",
  ACCOUNT_LIST: "/account-list",
  DAPP_CONNECTIVITY: "/dapp-connectivity",
  EDIT_DAPP_CONNECTED_ACCOUNTS: "/edit-dapp-connected-accounts",
  EDIT_DAPP_CONNECTED_BLOCKCHAINS: "/edit-dapp-connected-blockchains",
  CHAIN_CONNECTIVITY: "/chain-connectivity",
  ADD_EDIT_CHAIN: "/add-edit-chain",
  TRANSACTION_HISTORY: "/transaction-history",
  TRANSACTION_DETAIL: "/transaction-detail",
  CONTACTS: "/contacts",
  RECEIVE: "/receive",
  SETTINGS: "/settings",
  SETTINGS_APPEARANCE: "/settings-appearance",
  SETTINGS_SECURITY: "/settings-security",
  SETTINGS_PREFERENCES: "/settings-preferences",
  SETTINGS_DATA: "/settings-data",
  SETTINGS_ABOUT: "/settings-about",
  DEFAULT: "*",
};

const router = createMemoryRouter([
  {
    path: ROUTES.HOME,
    element: <QrlWeb3Wallet />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: ROUTES.CREATE_ACCOUNT,
        element: <CreateAccount />,
      },
      {
        path: ROUTES.IMPORT_ACCOUNT,
        element: <ImportAccount />,
      },
      {
        path: ROUTES.IMPORT_LEDGER,
        element: <ImportLedger />,
      },
      {
        path: ROUTES.IMPORT_TOKEN,
        element: <ImportToken />,
      },
      {
        path: ROUTES.IMPORT_NFT_COLLECTION,
        element: <ImportNFTCollection />,
      },
      {
        path: ROUTES.NFT_GALLERY,
        element: <NFTGallery />,
      },
      {
        path: ROUTES.NFT_DETAIL,
        element: <NFTDetail />,
      },
      {
        path: ROUTES.NFT_TRANSFER,
        element: <NFTTransfer />,
      },
      {
        path: ROUTES.ALL_QRC_20_TOKENS,
        element: <AllQRC20Tokens />,
      },
      {
        path: ROUTES.TOKEN_TRANSFER,
        element: <TokenTransfer />,
      },
      {
        path: ROUTES.ACCOUNT_LIST,
        element: <AccountList />,
      },
      {
        path: ROUTES.DAPP_CONNECTIVITY,
        element: <DAppConnectivity />,
      },
      {
        path: ROUTES.EDIT_DAPP_CONNECTED_ACCOUNTS,
        element: <EditDAppConnectedAccounts />,
      },
      {
        path: ROUTES.EDIT_DAPP_CONNECTED_BLOCKCHAINS,
        element: <EditDAppConnectedBlockchains />,
      },
      {
        path: ROUTES.CHAIN_CONNECTIVITY,
        element: <ChainConnectivity />,
      },
      {
        path: ROUTES.ADD_EDIT_CHAIN,
        element: <AddEditChain />,
      },
      {
        path: ROUTES.TRANSACTION_HISTORY,
        element: <TransactionHistory />,
      },
      {
        path: ROUTES.TRANSACTION_DETAIL,
        element: <TransactionDetail />,
      },
      {
        path: ROUTES.CONTACTS,
        element: <ContactsPage />,
      },
      {
        path: ROUTES.RECEIVE,
        element: <Receive />,
      },
      {
        path: ROUTES.SETTINGS,
        element: <Settings />,
      },
      {
        path: ROUTES.SETTINGS_APPEARANCE,
        element: <SettingsAppearance />,
      },
      {
        path: ROUTES.SETTINGS_SECURITY,
        element: <SettingsSecurity />,
      },
      {
        path: ROUTES.SETTINGS_PREFERENCES,
        element: <SettingsPreferences />,
      },
      {
        path: ROUTES.SETTINGS_DATA,
        element: <SettingsData />,
      },
      {
        path: ROUTES.SETTINGS_ABOUT,
        element: <SettingsAbout />,
      },
    ],
  },
  {
    path: ROUTES.DEFAULT,
    element: <QrlWeb3Wallet />,
  },
]);

export const AppRouter = () => {
  return <RouterProvider router={router} />;
};
