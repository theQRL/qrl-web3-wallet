import { JsonRpcMiddleware } from "@theqrl/qrl-wallet-provider/json-rpc-engine";
import { rpcErrors } from "@theqrl/qrl-wallet-provider/rpc-errors";
import { Json, JsonRpcRequest } from "@theqrl/qrl-wallet-provider/utils";

type Middleware = JsonRpcMiddleware<JsonRpcRequest, Json>;
type AsyncMiddleware = (...args: Parameters<Middleware>) => void | Promise<void>;

// The provider engine catches synchronous throws but does not await middleware.
export const withMiddlewareErrorBoundary = (
  middleware: AsyncMiddleware,
  name: string,
): Middleware => {
  return (req, res, next, end) => {
    void Promise.resolve()
      .then(() => middleware(req, res, next, end))
      .catch((error: unknown) => {
        console.error(`QrlWeb3Wallet: unhandled error in ${name}`, error);
        delete res.result;
        res.error = rpcErrors.internal({
          message: "The wallet could not process the request.",
        });
        end();
      });
  };
};
