import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/UI/Accordion";
import { Button } from "@/components/UI/Button";
import { Label } from "@/components/UI/Label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/UI/Tooltip";
import { getHexSeedFromMnemonic } from "@/functions/getHexSeedFromMnemonic";
import { useStore } from "@/stores/store";
import StringUtil, { sanitizeForDisplay } from "@/utilities/stringUtil";
import { MLDSA87, ExtendedSeed } from "@theqrl/wallet.js";
import { bytesToHex } from "@theqrl/web3-utils";
import { getEncodedEip712Data } from "@theqrl/web3-qrl-abi";
import { parseAndValidateSeed, sign } from "@theqrl/web3-qrl-accounts";
import { Copy } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

const MAX_INLINE_STRING_LEN = 200;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const tryDecimalAndHex = (v: string | number | bigint): string => {
  // For numeric types, EIP-712 frequently encodes large token values; show
  // both decimal and hex so users can recognise huge numbers (F-6).
  try {
    const asBig = typeof v === "bigint" ? v : BigInt(v as string | number);
    return `${asBig.toString(10)}  (0x${asBig.toString(16)})`;
  } catch {
    return String(v);
  }
};

const renderPrimitive = (v: unknown): { text: string; hadHidden: boolean } => {
  if (v === null || v === undefined) return { text: String(v), hadHidden: false };
  if (typeof v === "boolean") return { text: v ? "true" : "false", hadHidden: false };
  if (typeof v === "bigint") return { text: tryDecimalAndHex(v), hadHidden: false };
  if (typeof v === "number") return { text: tryDecimalAndHex(v), hadHidden: false };
  if (typeof v === "string") {
    // Numeric strings (decimal or 0x-hex) — render both forms.
    if (/^-?\d+$/.test(v) || /^0x[0-9a-fA-F]+$/.test(v)) {
      return { text: tryDecimalAndHex(v), hadHidden: false };
    }
    const { sanitized, hadHidden } = sanitizeForDisplay(v);
    if (sanitized.length > MAX_INLINE_STRING_LEN) {
      return {
        text: `${sanitized.slice(0, MAX_INLINE_STRING_LEN)}…  (${sanitized.length} chars total)`,
        hadHidden,
      };
    }
    return { text: sanitized, hadHidden };
  }
  return { text: JSON.stringify(v), hadHidden: false };
};

const TypedDataValue = ({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}) => {
  const indent = `ml-${Math.min(depth * 2, 12)}`;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <div className="font-bold text-secondary">[]</div>;
    }
    return (
      <div className={`flex flex-col gap-1 ${indent}`}>
        {value.map((item, idx) => (
          <div key={idx} className="flex flex-col">
            <div className="text-muted-foreground">[{idx}]</div>
            <div className="ml-2">
              <TypedDataValue value={item} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <div className="font-bold text-secondary">{"{}"}</div>;
    }
    return (
      <div className={`flex flex-col gap-1 ${indent}`}>
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <div className="text-muted-foreground">{k}</div>
            <div className="ml-2">
              <TypedDataValue value={v} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const rendered = renderPrimitive(value);
  return (
    <div className="break-all font-bold text-secondary">
      {rendered.text}
      {rendered.hadHidden && (
        <span className="ml-2 text-xs font-normal text-red-600">
          (hidden formatting characters removed)
        </span>
      )}
    </div>
  );
};

const QrlSignTypedDataV4Content = observer(() => {
  const { t } = useTranslation();
  const { lockStore, qrlStore, dAppRequestStore } = useStore();
  const { getMnemonicPhrases } = lockStore;
  const { qrlInstance, qrlConnection } = qrlStore;
  const { isConnected } = qrlConnection;
  const activeChainId = qrlConnection?.blockchain?.chainId;
  const {
    dAppRequestData,
    setOnPermissionCallBack,
    setCanProceed,
    addToResponseData,
  } = dAppRequestStore;

  const params = dAppRequestData?.params;
  const fromAddress = params?.[0] ?? "";
  const { prefix: prefixFromAddress, addressSplit: addressSplitFromAddress } =
    StringUtil.getSplitAddress(fromAddress);
  const typedData = params?.[1];
  const domain = (typedData?.domain ?? {}) as Record<string, unknown>;
  const message = (typedData?.message ?? {}) as Record<string, unknown>;
  const primaryType = typedData?.primaryType ?? "";
  const verifyingContract = (domain?.verifyingContract as string) ?? "";
  const {
    prefix: prefixVerifyingContract,
    addressSplit: addressSplitVerifyingContract,
  } = StringUtil.getSplitAddress(verifyingContract);

  const declaredChainId =
    domain?.chainId !== undefined && domain?.chainId !== null
      ? String(domain.chainId)
      : undefined;
  const chainIdMissing = declaredChainId === undefined;
  const normaliseChainId = (c: string | undefined) => {
    if (c === undefined) return undefined;
    try {
      return BigInt(c).toString(10);
    } catch {
      return c.toLowerCase();
    }
  };
  const chainIdMismatch =
    !chainIdMissing &&
    activeChainId !== undefined &&
    normaliseChainId(declaredChainId) !==
      normaliseChainId(activeChainId.toString());

  // EIP-2612 Permit, EIP-3009 TransferWithAuthorization, Permit2,
  // and similar off-chain approvals all encode an on-chain transfer
  // authorisation as a signed struct. Surface these explicitly so users
  // do not blind-sign token allowances.
  const APPROVAL_PRIMARY_TYPE_REGEX = /permit|approval|authorization/i;
  const isApprovalSignature = APPROVAL_PRIMARY_TYPE_REGEX.test(
    String(primaryType),
  );
  const approvalSpender = (message?.spender ??
    message?.to ??
    message?.holder ??
    message?.delegate) as string | undefined;
  const approvalAmountRaw = (message?.value ??
    message?.amount ??
    message?.allowed) as string | number | bigint | undefined;
  const formatApprovalAmount = (
    v: string | number | bigint | undefined,
  ): string | undefined => {
    if (v === undefined) return undefined;
    try {
      const asBig = typeof v === "bigint" ? v : BigInt(v as string | number);
      const UINT256_MAX = (1n << 256n) - 1n;
      if (asBig >= UINT256_MAX - 1n) return "unlimited (uint256 max)";
      return `${asBig.toString(10)}  (0x${asBig.toString(16)})`;
    } catch {
      return String(v);
    }
  };
  const approvalAmount = formatApprovalAmount(approvalAmountRaw);
  const approvalDeadline = (message?.deadline ?? message?.validBefore) as
    | string
    | number
    | bigint
    | undefined;

  useEffect(() => {
    if (isConnected) {
      const onPermissionCallBack = async (hasApproved: boolean) => {
        if (hasApproved) {
          signTypedDataV4();
        }
      };
      setOnPermissionCallBack(onPermissionCallBack);
    }
  }, [isConnected]);

  const copyMessageData = () => {
    navigator.clipboard.writeText(JSON.stringify(typedData));
  };

  const signTypedDataV4 = async () => {
    try {
      const mnemonicPhrases = await getMnemonicPhrases(fromAddress ?? "");
      const seed = getHexSeedFromMnemonic(mnemonicPhrases);
      const addressFromMnemonic =
        qrlInstance?.accounts.seedToAccount(seed)?.address;
      if (fromAddress !== addressFromMnemonic) {
        throw new Error("Mnemonic phrases did not match with the address");
      }
      const messageHash = getEncodedEip712Data(typedData, true);
      const signature = sign(messageHash, seed)?.signature;

      const seedUint8Array = parseAndValidateSeed(seed);
      const extSeed = new ExtendedSeed(seedUint8Array);
      const acc = MLDSA87.newWalletFromExtendedSeed(extSeed);
      const publicKey = bytesToHex(acc.getPK());

      if (signature) {
        addToResponseData({
          signature,
          publicKey,
        });
      } else {
        throw new Error("Message data could not be signed");
      }
    } catch (error) {
      addToResponseData({ error });
    }
  };

  useEffect(() => {
    setCanProceed(true);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col rounded-md p-2">
        <div className="flex flex-col gap-1">
          <div>{t('dapp.signature.fromAddress')}</div>
          <div className="w-64 font-bold text-secondary">{`${prefixFromAddress} ${addressSplitFromAddress.join(" ")}`}</div>
        </div>
      </div>
      <div className="rounded-md bg-muted/50 p-2 text-xs">
        <div className="font-semibold">Structured-data signature ({primaryType})</div>
        <div className="text-muted-foreground">
          This is an EIP-712 signature, distinct from a transaction. Review every field carefully — a signature here may authorise token transfers or contract actions on your behalf.
        </div>
      </div>
      {isApprovalSignature && (
        <div className="rounded-md border border-red-500 bg-red-50 p-2 text-xs text-red-900 dark:bg-red-900/30 dark:text-red-200">
          <strong>Token approval:</strong> this signature ({primaryType}) authorises the spender below to move tokens from your account once submitted on-chain. Verify each field carefully before approving.
          <div className="mt-1 flex flex-col gap-1">
            {approvalSpender && (
              <div>
                <span className="font-semibold">Spender:</span>{" "}
                <span className="break-all">{String(approvalSpender)}</span>
              </div>
            )}
            {approvalAmount && (
              <div>
                <span className="font-semibold">Amount:</span> {approvalAmount}
              </div>
            )}
            {approvalDeadline !== undefined && (
              <div>
                <span className="font-semibold">Deadline:</span>{" "}
                {String(approvalDeadline)}
              </div>
            )}
          </div>
        </div>
      )}
      {chainIdMissing && (
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-2 text-xs text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200">
          <strong>Warning:</strong> the dApp did not declare a chainId in the EIP-712 domain. This signature is not bound to any chain and could be replayed on any chain hosting the verifying contract.
        </div>
      )}
      {chainIdMismatch && (
        <div className="rounded-md border border-yellow-500 bg-yellow-50 p-2 text-xs text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200">
          <strong>Warning:</strong> the EIP-712 domain chainId ({declaredChainId}) does not match the wallet&apos;s active chain ({activeChainId}). The signature will be valid on the declared chain only.
        </div>
      )}
      <Accordion
        type="multiple"
        className="w-full space-y-6"
        defaultValue={["domain", "message"]}
      >
        <AccordionItem value="domain" className="border-b-0">
          <AccordionTrigger className="rounded-md bg-muted p-2">
            Domain
          </AccordionTrigger>
          <AccordionContent className="mt-2 rounded-md p-2 text-xs">
            <div className="flex flex-col gap-2">
              {domain?.name !== undefined && (
                <div className="flex flex-col gap-1">
                  <div>Name</div>
                  <div className="font-bold text-secondary">{String(domain.name)}</div>
                </div>
              )}
              {domain?.version !== undefined && (
                <div className="flex flex-col gap-1">
                  <div>Version</div>
                  <div className="font-bold text-secondary">{String(domain.version)}</div>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <div>Chain ID</div>
                <div className="font-bold text-secondary">
                  {chainIdMissing ? "(not declared)" : declaredChainId}
                </div>
              </div>
              {verifyingContract && (
                <div className="flex flex-col gap-1">
                  <div>Verifying Contract</div>
                  <div className="font-bold text-secondary">
                    {`${prefixVerifyingContract} ${addressSplitVerifyingContract.join(" ")}`}
                  </div>
                </div>
              )}
              {domain?.salt !== undefined && (
                <div className="flex flex-col gap-1">
                  <div>Salt</div>
                  <div className="break-all font-bold text-secondary">
                    {String(domain.salt)}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="message" className="border-b-0">
          <AccordionTrigger className="rounded-md bg-muted p-2">
            Message
          </AccordionTrigger>
          <AccordionContent className="mt-2 rounded-md p-2 text-xs">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div>Primary Type</div>
                  <div className="font-bold text-secondary">{primaryType}</div>
                </div>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      className="size-7 hover:text-secondary"
                      variant="outline"
                      size="icon"
                      aria-label="Copy message data"
                      onClick={copyMessageData}
                    >
                      <Copy size="16" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <Label>{t('dapp.signature.copyMessage')}</Label>
                  </TooltipContent>
                </Tooltip>
              </div>
              <TypedDataValue value={message} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
});

export default QrlSignTypedDataV4Content;
