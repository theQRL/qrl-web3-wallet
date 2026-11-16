import { useStore } from "@/stores/store";
import StorageUtil from "@/utilities/storageUtil";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import QRC20Token from "./QRC20Token/QRC20Token";
import { QRC_20_ITEMS_DISPLAY_LIMIT } from "@/constants/qrc20Token";
import { TokenContractType } from "@/scripts/middlewares/middlewareTypes";

type QRC20TokensProps = {
  shouldDisplayAllTokens?: boolean;
};

const QRC20Tokens = observer(
  ({ shouldDisplayAllTokens = false }: QRC20TokensProps) => {
    const { qrlStore } = useStore();
    const { activeAccount, qrlConnection } = qrlStore;
    const { accountAddress } = activeAccount;
    const { blockchain } = qrlConnection;

    const [reRender, setReRender] = useState(0);
    const [tokenContractsList, setTokenContractsList] = useState<
      TokenContractType[]
    >([]);

    const numberOfTokens = tokenContractsList.length;
    const displayLimit = shouldDisplayAllTokens
      ? numberOfTokens + 1
      : QRC_20_ITEMS_DISPLAY_LIMIT;

    useEffect(() => {
      (async () => {
        const storedTokens =
          await StorageUtil.getTokenContractsList(accountAddress);
        setTokenContractsList(storedTokens);
      })();
    }, [blockchain, accountAddress, reRender]);

    const triggerReRender = () => {
      setReRender(reRender + 1);
    };

    if (shouldDisplayAllTokens && !numberOfTokens) {
      return <div>There are no tokens.</div>;
    }

    return (
      <>
        {tokenContractsList.slice(0, displayLimit).map(({ address, image }) => (
          <QRC20Token
            key={address}
            contractAddress={address}
            tokenImage={image}
            triggerReRender={triggerReRender}
          />
        ))}
      </>
    );
  },
);

export default QRC20Tokens;
