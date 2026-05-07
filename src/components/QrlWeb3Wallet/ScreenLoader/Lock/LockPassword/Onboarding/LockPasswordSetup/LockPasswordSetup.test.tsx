import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import LockPasswordSetup from "./LockPasswordSetup";
import { ONBOARDING_STEPS } from "../Onboarding";

describe("LockPasswordSetup", () => {
  afterEach(cleanup);

  const renderComponent = (
    mockedStoreValues = mockedStore(),
    mockedProps: ComponentProps<typeof LockPasswordSetup> = {
      selectStep: () => {},
      setNewPassword: () => {},
    },
  ) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <LockPasswordSetup {...mockedProps} />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the lock password setup component", () => {
    renderComponent();

    expect(
      screen.getByRole("heading", { level: 3, name: "Set Wallet Password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Set a password for this wallet"),
    ).toBeInTheDocument();
    const passwordField = screen.getByLabelText("password");
    expect(passwordField).toBeInTheDocument();
    expect(passwordField).toBeEnabled();
    const reEnterPasswordField = screen.getByLabelText("reEnteredPassword");
    expect(reEnterPasswordField).toBeInTheDocument();
    expect(reEnterPasswordField).toBeEnabled();
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeInTheDocument();
    expect(continueButton).toBeDisabled();
  });

  it("should display the field error if password validation fails", async () => {
    renderComponent();

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeInTheDocument();
    expect(continueButton).toBeDisabled();
    const passwordField = screen.getByLabelText("password");
    await userEvent.type(passwordField, "test");
    expect(passwordField).toHaveValue("test");
    expect(
      screen.getByText("Password must be at least 12 characters"),
    ).toBeInTheDocument();
    await userEvent.type(passwordField, "password");
    expect(passwordField).toHaveValue("testpassword");
    expect(
      screen.queryByText("Password must be at least 12 characters"),
    ).not.toBeInTheDocument();
    const reEnterPasswordField = screen.getByLabelText("reEnteredPassword");
    await userEvent.type(reEnterPasswordField, "test");
    expect(reEnterPasswordField).toHaveValue("test");
    expect(
      screen.getByText("Password must be at least 12 characters"),
    ).toBeInTheDocument();
    await userEvent.type(reEnterPasswordField, "password");
    expect(reEnterPasswordField).toHaveValue("testpassword");
    expect(
      screen.queryByText("Password must be at least 12 characters"),
    ).not.toBeInTheDocument();
    expect(continueButton).toBeEnabled();
  });

  it("should invoke the selectStep method on clicking continue", async () => {
    const mockedSelectStep = vi.fn();
    const mockedSetNewPassword = vi.fn();
    renderComponent(mockedStore(), {
      selectStep: mockedSelectStep,
      setNewPassword: mockedSetNewPassword,
    });

    const passwordField = screen.getByLabelText("password");
    await userEvent.type(passwordField, "testpassword");
    const reEnterPasswordField = screen.getByLabelText("reEnteredPassword");
    await userEvent.type(reEnterPasswordField, "testpassword");
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeInTheDocument();
    expect(continueButton).toBeEnabled();
    await userEvent.click(continueButton);
    expect(mockedSelectStep).toHaveBeenCalledTimes(1);
    expect(mockedSelectStep).toHaveBeenCalledWith(
      ONBOARDING_STEPS.ADD_OR_IMPORT_ACCOUNT,
    );
    expect(mockedSetNewPassword).toHaveBeenCalledTimes(1);
  });
});
