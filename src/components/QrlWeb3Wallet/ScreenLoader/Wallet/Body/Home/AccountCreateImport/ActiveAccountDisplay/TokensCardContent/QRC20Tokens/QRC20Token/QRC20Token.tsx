import { getOptimalTokenBalance } from "@/functions/getOptimalTokenBalance";
import { useStore } from "@/stores/store";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import TokenListItem from "../../TokenListItem/TokenListItem";
import TokenListItemLoading from "../../TokenListItemLoading/TokenListItemLoading";

type QRC20TokenProps = {
  contractAddress: string;
  tokenImage: string;
  triggerReRender?: () => void;
};

const QRC20Token = observer(
  ({ contractAddress, tokenImage, triggerReRender }: QRC20TokenProps) => {
    const { qrlStore } = useStore();
    const { qrlConnection, activeAccount, getQrc20TokenDetails } = qrlStore;
    const { blockchain } = qrlConnection;
    const { accountAddress } = activeAccount;

    const [token, setToken] =
      useState<Awaited<ReturnType<typeof getQrc20TokenDetails>>["token"]>();

    useEffect(() => {
      (async () => {
        const tokenDetails = await getQrc20TokenDetails(contractAddress);
        if (!tokenDetails.error) {
          setToken(tokenDetails.token);
        }
      })();
    }, [blockchain, accountAddress]);

    return !token ? (
      <TokenListItemLoading />
    ) : (
      <TokenListItem
        isQrc20Token={true}
        contractAddress={contractAddress}
        decimals={Number(token.decimals)}
        balance={getOptimalTokenBalance(token.balance.toString(), token.symbol)}
        name={token.name}
        symbol={token.symbol}
        image={tokenImage}
        triggerReRender={triggerReRender}
      />
    );
  },
);

export default QRC20Token;
