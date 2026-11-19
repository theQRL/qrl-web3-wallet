import { observer } from "mobx-react-lite";
import NativeToken from "./NativeToken/NativeToken";
import QRC20Tokens from "./QRC20Tokens/QRC20Tokens";

const TokensCardContent = observer(() => {
  return (
    <div className="flex flex-col gap-2">
      <NativeToken />
      <QRC20Tokens />
    </div>
  );
});

export default TokensCardContent;
