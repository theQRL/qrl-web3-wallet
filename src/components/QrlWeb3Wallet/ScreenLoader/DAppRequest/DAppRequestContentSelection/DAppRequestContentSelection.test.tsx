import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DAppRequestContentSelection from "./DAppRequestContentSelection";
import { RESTRICTED_METHODS } from "@/scripts/constants/requestConstants";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/AddQrlChainContent/AddQrlChainContent",
  () => ({ default: () => <div>Mocked Add Qrl Chain Content</div> }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/PermissionRequiredContent/PermissionRequiredContent",
  () => ({ default: () => <div>Mocked Permission Required Content</div> }),
);

describe("DAppRequestContentSelection", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <DAppRequestContentSelection />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should display the add QRL chain content if the method is wallet_addQRLChain", () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: { method: RESTRICTED_METHODS.WALLET_ADD_QRL_CHAIN },
        },
      }),
    );

    expect(
      screen.getByText("Mocked Add Qrl Chain Content"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Mocked Permission Required Content"),
    ).not.toBeInTheDocument();
  });

  it("should display the permission required content if the method is personal_sign", () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: { method: RESTRICTED_METHODS.PERSONAL_SIGN },
        },
      }),
    );

    expect(
      screen.queryByText("Mocked Add Qrl Chain Content"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Mocked Permission Required Content"),
    ).toBeInTheDocument();
  });

  it("should display the permission required content if the method is qrl_requestAccounts", () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: { method: RESTRICTED_METHODS.QRL_REQUEST_ACCOUNTS },
        },
      }),
    );

    expect(
      screen.queryByText("Mocked Add Qrl Chain Content"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Mocked Permission Required Content"),
    ).toBeInTheDocument();
  });

  it("should display the permission required content if the method is qrl_sendTransaction", () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: { method: RESTRICTED_METHODS.QRL_SEND_TRANSACTION },
        },
      }),
    );

    expect(
      screen.queryByText("Mocked Add Qrl Chain Content"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Mocked Permission Required Content"),
    ).toBeInTheDocument();
  });

  it("should display the permission required content if the method is qrl_signTypedData_v4", () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            method: RESTRICTED_METHODS.QRL_SIGN_TYPED_DATA_V4,
          },
        },
      }),
    );

    expect(
      screen.queryByText("Mocked Add Qrl Chain Content"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Mocked Permission Required Content"),
    ).toBeInTheDocument();
  });

  it("should return null if the method is unknown", () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            method: "unknown_method",
          },
        },
      }),
    );

    expect(
      screen.queryByText("Mocked Add Qrl Chain Content"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Mocked Permission Required Content"),
    ).not.toBeInTheDocument();
  });
});
