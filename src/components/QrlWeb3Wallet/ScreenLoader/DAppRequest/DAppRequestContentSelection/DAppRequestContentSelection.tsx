import { RESTRICTED_METHODS } from "@/scripts/constants/requestConstants";
import { useStore } from "@/stores/store";
import { observer } from "mobx-react-lite";
import AddQrlChainContent from "./AddQrlChainContent/AddQrlChainContent";
import PermissionRequiredContent from "./PermissionRequiredContent/PermissionRequiredContent";
import SwitchQrlChainContent from "./SwitchQrlChainContent/SwitchQrlChainContent";
import WatchAssetContent from "./WatchAssetContent/WatchAssetContent";

const PERMISSION_REQUIRED_METHODS: string[] = [
  RESTRICTED_METHODS.PERSONAL_SIGN,
  RESTRICTED_METHODS.QRL_REQUEST_ACCOUNTS,
  RESTRICTED_METHODS.WALLET_REQUEST_PERMISSIONS,
  RESTRICTED_METHODS.QRL_SEND_TRANSACTION,
  RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4,
];

const DAppRequestContentSelection = observer(() => {
  const { dAppRequestStore } = useStore();
  const { dAppRequestData } = dAppRequestStore;
  const method = dAppRequestData?.method ?? "";

  if (method === RESTRICTED_METHODS.WALLET_ADD_QRL_CHAIN)
    return <AddQrlChainContent />;

  if (method === RESTRICTED_METHODS.WALLET_SWITCH_QRL_CHAIN)
    return <SwitchQrlChainContent />;

  if (method === RESTRICTED_METHODS.WALLET_WATCH_ASSET)
    return <WatchAssetContent />;

  if (PERMISSION_REQUIRED_METHODS.includes(method))
    return <PermissionRequiredContent />;
});

export default DAppRequestContentSelection;
