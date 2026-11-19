import { Card, CardContent, CardHeader, CardTitle } from "@/components/UI/Card";
import { useTranslation } from "react-i18next";
import QRC20Tokens from "../Home/AccountCreateImport/ActiveAccountDisplay/TokensCardContent/QRC20Tokens/QRC20Tokens";
import BackButton from "../../../Shared/BackButton/BackButton";
import CircuitBackground from "../../../Shared/CircuitBackground/CircuitBackground";

const AllQRC20Tokens = () => {
  const { t } = useTranslation();
  return (
    <>
      <CircuitBackground />
      <div className="relative z-10 p-8">
        <BackButton />
        <Card>
          <CardHeader>
            <CardTitle>{t('tokens.allQrc20')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QRC20Tokens shouldDisplayAllTokens={true} />
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default AllQRC20Tokens;
