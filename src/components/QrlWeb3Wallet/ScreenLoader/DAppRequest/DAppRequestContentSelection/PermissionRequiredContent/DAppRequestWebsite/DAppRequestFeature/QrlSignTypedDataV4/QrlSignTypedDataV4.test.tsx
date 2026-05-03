import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QrlSignTypedDataV4 from "./QrlSignTypedDataV4";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/PermissionRequiredContent/DAppRequestWebsite/DAppRequestFeature/QrlSignTypedDataV4/QrlSignTypedDataV4Content/QrlSignTypedDataV4Content",
  () => ({ default: () => <div>Mocked Qrl Sign Typed Data V4 Content</div> }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/PermissionRequiredContent/DAppRequestWebsite/DAppRequestFeature/QrlSignTypedDataV4/PersonalSign/PersonalSign",
  () => ({ default: () => <div>Mocked Personal Sign</div> }),
);

describe("QrlSignTypedDataV4", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <QrlSignTypedDataV4 />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the QrlSignTypedDataV4Content component if the method is qrl_signTypedData_v4", () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            method: "qrl_signTypedData_v4",
          },
        },
      }),
    );

    expect(screen.getByText("Signature Request")).toBeInTheDocument();
    expect(
      screen.getByText("Review and sign the below message data"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mocked Qrl Sign Typed Data V4 Content"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Mocked Personal Sign")).not.toBeInTheDocument();
  });

  it("should render the PersonalSign component if the method is personal_sign", () => {
    renderComponent(
      mockedStore({
        dAppRequestStore: {
          dAppRequestData: {
            method: "personal_sign",
          },
        },
      }),
    );

    expect(screen.getByText("Signature Request")).toBeInTheDocument();
    expect(
      screen.getByText("Review and sign the below message data"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mocked Personal Sign")).toBeInTheDocument();
    expect(
      screen.queryByText("Mocked Qrl Sign Typed Data V4 Content"),
    ).not.toBeInTheDocument();
  });
});
