import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import OnboardingCompleted from "./OnboardingCompleted";

describe("OnboardingCompleted", () => {
  beforeEach(() => {
    Object.defineProperty(window, "close", {
      value: vi.fn(),
      writable: true,
    });
  });

  afterEach(cleanup);

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <OnboardingCompleted />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the onboarding completed component", () => {
    renderComponent();

    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "That's All",
    );
    expect(
      screen.getByText(
        "The QRL Web3 Wallet is now ready for use. You can open it from the browser extensions.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-completed")).toBeInTheDocument();
    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeInTheDocument();
    expect(doneButton).toBeEnabled();
  });

  it("should close the tab on clicking done button", async () => {
    renderComponent();

    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeInTheDocument();
    expect(doneButton).toBeEnabled();
    await userEvent.click(doneButton);
    expect(window.close).toHaveBeenCalledTimes(1);
  });

  it("should end the onboarding for its page, which shows the wallet where the browser does not close it", async () => {
    const setOnboarding = vi.fn();
    renderComponent(mockedStore({ lockStore: { setOnboarding } }));

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(setOnboarding).toHaveBeenCalledWith(false);
  });
});
