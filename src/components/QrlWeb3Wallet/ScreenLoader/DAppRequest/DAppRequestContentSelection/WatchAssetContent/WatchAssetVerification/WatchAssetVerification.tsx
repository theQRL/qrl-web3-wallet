import { Card } from "@/components/UI/Card";
import { useStore } from "@/stores/store";
import { Loader, ShieldAlert } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";

const WatchAssetVerification = observer(() => {
  const { dAppRequestStore, qrlStore } = useStore();
  const { getQrc20TokenDetails } = qrlStore;
  const { dAppRequestData } = dAppRequestStore;
  const paramsObject = dAppRequestData?.params[0];
  const contractAddress = paramsObject?.options?.address ?? "";
  const contractSymbol = paramsObject?.options?.symbol ?? "";
  const contractDecimals = BigInt(paramsObject?.options?.decimals ?? 0);

  const [hasVerified, setHasVerified] = useState(false);
  const [verificationResult, setVerificationResult] = useState("");

  useEffect(() => {
    (async () => {
      const tokenDetails = await getQrc20TokenDetails(contractAddress);
      if (tokenDetails.error) {
        setVerificationResult(`Failed to fetch details for ${contractAddress}`);
      } else {
        if (tokenDetails?.token?.symbol !== contractSymbol) {
          setVerificationResult(
            `The token symbol did not match. Expected '${tokenDetails?.token?.symbol}', but received '${contractSymbol}'`,
          );
        } else if (tokenDetails?.token?.decimals !== contractDecimals) {
          setVerificationResult(
            `The token decimals did not match. Expected '${tokenDetails?.token?.decimals}', but received '${contractDecimals}'`,
          );
        }
      }
      setHasVerified(true);
    })();
  }, []);

  if (!hasVerified) {
    return (
      <Card className="flex gap-4 p-4">
        <Loader className="h-4 w-4 shrink-0 animate-spin" />
        <div>Verifying token details...</div>
      </Card>
    );
  }

  return verificationResult ? (
    <Card className="flex gap-2 p-4 text-destructive">
      <ShieldAlert className="h-5 w-5 shrink-0 pt-1" />
      <div>{verificationResult}</div>
    </Card>
  ) : (
    <Card className="flex gap-2 p-4">
      <ShieldAlert className="h-5 w-5 shrink-0 pt-1" />
      <div>
        Ensure you understand what you are doing before adding the token.
      </div>
    </Card>
  );
});

export default WatchAssetVerification;
