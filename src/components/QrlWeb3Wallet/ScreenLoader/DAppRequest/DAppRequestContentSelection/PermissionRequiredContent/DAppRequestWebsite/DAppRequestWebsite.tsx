import { Card } from "@/components/UI/Card";
import { Separator } from "@/components/UI/Separator";
import { useStore } from "@/stores/store";
import { observer } from "mobx-react-lite";
import DAppRequestFeature from "./DAppRequestFeature/DAppRequestFeature";

const DAppRequestWebsite = observer(() => {
  const { dAppRequestStore } = useStore();
  const { dAppRequestData } = dAppRequestStore;

  const senderData = dAppRequestData?.requestData?.senderData as
    | {
        url?: string;
        favIconUrl?: string;
        title?: string;
        mainFrameOrigin?: string;
      }
    | undefined;
  const parsedUrl = new URL(senderData?.url ?? "");
  const urlOrigin = parsedUrl.origin;
  let parentOrigin: string | undefined;
  try {
    parentOrigin = senderData?.mainFrameOrigin
      ? new URL(senderData.mainFrameOrigin).origin
      : undefined;
  } catch {
    parentOrigin = undefined;
  }
  const isCrossOriginIframe =
    parentOrigin !== undefined && parentOrigin !== urlOrigin;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-4">
        {senderData?.favIconUrl && (
          <img
            className="h-6 w-6 opacity-70"
            src={senderData.favIconUrl}
            alt=""
            title="page-supplied icon"
          />
        )}
        <div className="flex flex-col">
          <span className="font-bold">{urlOrigin}</span>
          {senderData?.title && (
            <span
              className="text-xm opacity-60"
              title="page-supplied title — do not trust as origin"
            >
              {senderData.title}{" "}
              <span className="text-[10px] uppercase tracking-wide">
                (page-supplied)
              </span>
            </span>
          )}
        </div>
      </div>
      {isCrossOriginIframe && (
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-2 text-xs text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200">
          <strong>Embedded request:</strong> this dApp is loaded inside an
          iframe on <span className="font-mono">{parentOrigin}</span>. Verify
          you trust the page hosting the iframe before approving.
        </div>
      )}
      <Separator />
      <DAppRequestFeature />
    </Card>
  );
});

export default DAppRequestWebsite;
