import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import QrlRequestAccountContent from "./QrlRequestAccountContent";

vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/PermissionRequiredContent/DAppRequestWebsite/DAppRequestFeature/QrlRequestAccount/QrlRequestAccountContent/QrlRequestAccountAccountSelection/QrlRequestAccountAccountSelection",
  () => ({ default: () => <div>Mocked Qrl Request Account Account Selection</div> }),
);
vi.mock(
  "@/components/QrlWeb3Wallet/ScreenLoader/DAppRequest/DAppRequestContentSelection/PermissionRequiredContent/DAppRequestWebsite/DAppRequestFeature/QrlRequestAccount/QrlRequestAccountContent/QrlRequestAccountBlockchainSelection/QrlRequestAccountBlockchainSelection",
  () => ({ default: () => <div>Mocked Qrl Request Account Blockchain Selection</div> }),
);

describe("QrlRequestAccountContent", () => {
  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <QrlRequestAccountContent />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the qrl request account content component", async () => {
    renderComponent(
      mockedStore({
        qrlStore: { qrlAccounts: { isLoading: false } },
        dAppRequestStore: {
          currentTabData: {
            connectedAccounts: ["Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000"],
          },
        },
      }),
    );

    const accountsTab = screen.getByRole("tab", { name: "Accounts" });
    expect(accountsTab).toBeInTheDocument();
    const blockchainsTab = screen.getByRole("tab", { name: "Blockchains" });
    expect(blockchainsTab).toBeInTheDocument();
    expect(
      screen.getByText("Mocked Qrl Request Account Account Selection"),
    ).toBeInTheDocument();
    await userEvent.click(blockchainsTab);
    expect(
      screen.getByText("Mocked Qrl Request Account Blockchain Selection"),
    ).toBeInTheDocument();
  });
});
