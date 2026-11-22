import withSuspense from "@/functions/withSuspense";
import { useStore } from "@/stores/store";
import { observer } from "mobx-react-lite";
import { lazy, useEffect, useRef, useState } from "react";

const SCREENS = {
  LOCK: "LOCK",
  DAPP_REQUEST: "DAPP_REQUEST",
  WALLET: "WALLET",
};

const Lock = withSuspense(
  lazy(() => import("@/components/QrlWeb3Wallet/ScreenLoader/Lock/Lock")),
);
const DAppRequest = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequest"
      ),
  ),
);
const Wallet = withSuspense(
  lazy(() => import("@/components/QrlWeb3Wallet/ScreenLoader/Wallet/Wallet")),
);
const FreshWallet = withSuspense(
  lazy(
    () =>
      import(
        "@/components/QrlWeb3Wallet/ScreenLoader/FreshWallet/FreshWallet"
      ),
  ),
);

const ScreenLoader = observer(() => {
  const { dAppRequestStore, lockStore, qrlStore } = useStore();
  const { hasDAppRequest, readDAppRequestData } = dAppRequestStore;
  const { isLocked, isOnboarding, readLockState, storageState } = lockStore;

  const [screen, setScreen] = useState(SCREENS.LOCK);
  const wasLockedRef = useRef(true);

  useEffect(() => {
    // A wallet stored by an earlier build gets its own screen. Neither the
    // lock state nor a dApp request is loaded for it.
    if (storageState !== "current") return;
    (async () => {
      await readLockState();
      await readDAppRequestData();
    })();
  }, [storageState]);

  useEffect(() => {
    if (wasLockedRef.current && !isLocked) {
      // Re-initialize blockchain connection after unlock so the wallet
      // doesn't stay in a "not connected" state when the service worker
      // was asleep during the initial load.
      qrlStore.initializeBlockchain();
    }
    wasLockedRef.current = isLocked;
  }, [isLocked]);

  useEffect(() => {
    if (isLocked || isOnboarding) {
      // The onboarding lives on the lock screen and stays there until the
      // user has gone through its last step.
      setScreen(SCREENS.LOCK);
    } else if (hasDAppRequest) {
      setScreen(SCREENS.DAPP_REQUEST);
    } else {
      setScreen(SCREENS.WALLET);
    }
  }, [isLocked, isOnboarding, hasDAppRequest]);

  if (storageState === "checking") return null;

  if (storageState === "outdated") return <FreshWallet />;

  if (screen === SCREENS.LOCK) return <Lock />;

  if (screen === SCREENS.DAPP_REQUEST) return <DAppRequest />;

  if (screen === SCREENS.WALLET) return <Wallet />;
});

export default ScreenLoader;
