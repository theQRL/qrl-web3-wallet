import { DAPP_REQUEST_PORT_NAME } from "@/scripts/constants/streamConstants";
import { useStore } from "@/stores/store";
import { Loader } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import browser from "webextension-polyfill";
import CircuitBackground from "../Shared/CircuitBackground/CircuitBackground";
import DAppRequestContentSelection from "./DAppRequestContentSelection/DAppRequestContentSelection";
import PhishingWarning from "./PhishingWarning/PhishingWarning";

const DAppRequest = observer(() => {
  const { qrlStore, dAppRequestStore, settingsStore } = useStore();
  const { qrlConnection } = qrlStore;
  const { isLoading } = qrlConnection;
  const { dAppRequestData, approvalProcessingStatus, onPermission } =
    dAppRequestStore;
  const { hasCompleted } = approvalProcessingStatus;
  const { phishingDetectionEnabled } = settingsStore;

  const [phishingAcknowledged, setPhishingAcknowledged] = useState(false);

  const phishingResult = dAppRequestData?.phishingResult;
  const isDomainPhishing =
    phishingDetectionEnabled && (phishingResult?.isDomainPhishing ?? false);
  const showPhishingWarning = isDomainPhishing && !phishingAcknowledged;
  const phishingDetectorUnavailable =
    phishingDetectionEnabled &&
    phishingResult !== undefined &&
    phishingResult.detectorStatus !== undefined &&
    phishingResult.detectorStatus !== "ready";

  useEffect(() => {
    if (hasCompleted) {
      window.close();
    }
  }, [hasCompleted]);

  // Hold a port open while the dApp request is on screen. The middleware
  // listens for this port's disconnect to resolve as user-rejected when the
  // popup is closed without an explicit Approve/Reject click.
  useEffect(() => {
    let port: browser.Runtime.Port | undefined;
    try {
      port = browser.runtime.connect({ name: DAPP_REQUEST_PORT_NAME });
    } catch {
      // SW not reachable; the middleware's safety timeout will resolve.
    }
    return () => {
      try {
        port?.disconnect();
      } catch {
        // already disconnected
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center pt-48">
        <Loader className="animate-spin" size={86} />
      </div>
    );
  }

  const senderUrl = dAppRequestData?.requestData?.senderData?.url ?? "";
  let domain = "";
  try {
    domain = new URL(senderUrl).hostname;
  } catch {
    // invalid URL
  }

  return (
    <>
      <CircuitBackground />
      <div className="relative z-10 flex flex-col items-center space-y-4 p-4">
        {phishingDetectorUnavailable && (
          <div className="w-full max-w-md rounded-md border border-yellow-500 bg-yellow-50 p-2 text-xs text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200">
            <strong>Phishing protection unavailable.</strong> The wallet
            could not load its phishing blocklist
            {phishingResult?.detectorStatus
              ? ` (${phishingResult.detectorStatus})`
              : ""}
            . The dApp below has not been checked against any blocklist —
            verify the origin manually before approving.
          </div>
        )}
        <DAppRequestContentSelection />
      </div>
      <PhishingWarning
        isOpen={showPhishingWarning}
        domain={domain}
        matchedDomain={phishingResult?.matchedDomain}
        onReject={() => onPermission(false)}
        onProceedAnyway={() => setPhishingAcknowledged(true)}
      />
    </>
  );
});

export default DAppRequest;
