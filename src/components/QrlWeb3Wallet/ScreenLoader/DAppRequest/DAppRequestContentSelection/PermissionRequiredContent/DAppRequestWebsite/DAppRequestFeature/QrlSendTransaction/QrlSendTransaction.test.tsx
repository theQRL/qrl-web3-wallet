import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QrlSendTransaction from "./QrlSendTransaction";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/PermissionRequiredContent/DAppRequestWebsite/DAppRequestFeature/QrlSendTransaction/QrlSendTransactionForContent/QrlSendTransactionForContent",
  () => ({ default: () => <div>Mocked Qrl Send Transaction For Content</div> }),
);

describe("QrlSendTransaction", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <QrlSendTransaction />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the qrl send transaction component for contract deployment", () => {
    const requestForContractDeployment = {
      data: "0x6080604052348015600e575f5ffd5b506101298061001c5f395ff3fe6080604052348015600e575f5ffd5b50600436106030575f3560e01c8063271f88b4146034578063d321fe2914604c575b5f5ffd5b604a60048036038101906046919060a9565b6066565b005b6052606f565b604051605d919060dc565b60405180910390f35b805f8190555050565b5f5f54905090565b5f5ffd5b5f819050919050565b608b81607b565b81146094575f5ffd5b50565b5f8135905060a3816084565b92915050565b5f6020828403121560bb5760ba6077565b5b5f60c6848285016097565b91505092915050565b60d681607b565b82525050565b5f60208201905060ed5f83018460cf565b9291505056fea26469706673582212203f5c1f328bda9fceed794ae68885d6664554bf4d7dbb1df839cc372d276837ab64736f6c634300081b0033",
      from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
      gas: "0x1cbb3",
      type: "0x2",
      value: "0x0",
    };
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [requestForContractDeployment],
          },
        },
      }),
    );

    expect(screen.getByText("Deploy a contract")).toBeInTheDocument();
    expect(
      screen.getByText("This site wants to deploy a contract"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mocked Qrl Send Transaction For Content"),
    ).toBeInTheDocument();
  });

  it("should render the qrl send transaction component for contract interaction", () => {
    const requestForContractInteraction = {
      from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
      to: "Q0000000000000000000000000000000000000000000000000000000020EE9760786AD48aB90E326c5cd78c6269Ba10AB00000000000000000000000000000000",
      data: "0x6080604052348015600e575f5ffd5b506101298061001c5f395ff3fe6080604052348015600e575f5ffd5b50600436106030575f3560e01c8063271f88b4146034578063d321fe2914604c575b5f5ffd5b604a60048036038101906046919060a9565b6066565b005b6052606f565b604051605d919060dc565b60405180910390f35b805f8190555050565b5f5f54905090565b5f5ffd5b5f819050919050565b608b81607b565b81146094575f5ffd5b50565b5f8135905060a3816084565b92915050565b5f6020828403121560bb5760ba6077565b5b5f60c6848285016097565b91505092915050565b60d681607b565b82525050565b5f60208201905060ed5f83018460cf565b9291505056fea26469706673582212203f5c1f328bda9fceed794ae68885d6664554bf4d7dbb1df839cc372d276837ab64736f6c634300081b0033",
      value: "0x0",
      gas: "0x1cbb3",
      type: "0x2",
    };
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [requestForContractInteraction],
          },
        },
      }),
    );

    expect(screen.getByText("Interact with a contract")).toBeInTheDocument();
    expect(
      screen.getByText("This site wants to interact with a contract"),
    ).toBeInTheDocument();
  });

  it("should render the qrl send transaction component for qrl transfer", () => {
    const requestForZndTransfer = {
      from: "Q0000000000000000000000000000000000000000000000000000000020D20b8026B8F02540246f58120ddAAf35AECD9B00000000000000000000000000000000",
      to: "Q0000000000000000000000000000000000000000000000000000000020EE9760786AD48aB90E326c5cd78c6269Ba10AB00000000000000000000000000000000",
      value: "0x30",
      gas: "0x1cbb3",
      type: "0x2",
    };
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            params: [requestForZndTransfer],
          },
        },
      }),
    );

    expect(screen.getByText("Transfer QRL")).toBeInTheDocument();
    expect(screen.getByText("This site wants to send QRL")).toBeInTheDocument();
  });
});
