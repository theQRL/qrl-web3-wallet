import { ROUTES } from "@/router/router";
import StorageUtil from "@/utilities/storageUtil";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * An empty component that stays inside the QrlWeb3Wallet component to watch for changing routes.
 * This component takes care of scrolling the screen to top on route change and ensures the user is redirected to the same page on opening the extension.
 */
const RouteMonitor = () => {
  const [previousRouteUsed, setPreviousRouteUsed] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    (async () => {
      const activePage = await StorageUtil.getActivePage();
      if (activePage) {
        await StorageUtil.clearActivePage();
        setPreviousRouteUsed(true);
        navigate(activePage);
      } else if (!activePage) {
        setPreviousRouteUsed(true);
        navigate(ROUTES.HOME);
      }
    })();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    (async () => {
      if (previousRouteUsed) await StorageUtil.setActivePage(pathname);
    })();
  }, [pathname]);

  return null;
};

export default RouteMonitor;
