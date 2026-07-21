import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QrlRequestAccount from "./QrlRequestAccount";

describe("QrlRequestAccount", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <QrlRequestAccount />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the qrl request account component, with an account in qrl store", () => {
    renderComponent(
      mockedStore({
        qrlStore: {
          qrlAccounts: {
            isLoading: false,
            accounts: [
              {
                accountAddress: "Q0000000000000000000000000000000000000000000000000000000020915094FEDE91EFAC68fD43D82e9Fff4daC748200000000000000000000000000000000",
                accountBalance: "10 QRL",
              },
            ],
          },
          getAccountBalance: () => "10.0 QRL",
        },
      }),
    );

    expect(screen.getByText("Connect with Wallet")).toBeInTheDocument();
    const checkBox = screen.getByRole("checkbox", {
      name: "accountsCheckbox",
    });
    expect(screen.getByRole("heading", { level: 5 })).toHaveTextContent(
      "Careful!",
    );
    expect(
      screen.getByText(
        "There are token approval scams out there. Ensure you only connect your wallet with the websites you trust.",
      ),
    ).toBeInTheDocument();
    expect(checkBox).toBeInTheDocument();
    expect(checkBox).toBeEnabled();
    expect(screen.getByText("Q00000")).toBeInTheDocument();
    expect(screen.getByText("02091")).toBeInTheDocument();
    expect(screen.getByText("5094F")).toBeInTheDocument();
    expect(screen.getByText("EDE91")).toBeInTheDocument();
    expect(screen.getByText("EFAC6")).toBeInTheDocument();
    expect(screen.getByText("8fD43")).toBeInTheDocument();
    expect(screen.getByText("D82e9")).toBeInTheDocument();
    expect(screen.getByText("Fff4d")).toBeInTheDocument();
    expect(screen.getByText("aC748")).toBeInTheDocument();
    expect(
      screen.queryByText("Account not available to connect"),
    ).not.toBeInTheDocument();
  });

  it("should render the qrl request account component, without an account in qrl store", () => {
    renderComponent(
      mockedStore({
        qrlStore: { qrlAccounts: { isLoading: false, accounts: [] } },
      }),
    );

    const checkBox = screen.queryByRole("checkbox", {
      name: "Q 2090E 9F387 71876 FB6Fc 51a6b 46412 1d3cC 093A1",
    });
    expect(checkBox).not.toBeInTheDocument();
    expect(
      screen.getByText("No accounts available to connect"),
    ).toBeInTheDocument();
  });
});
