import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactForm from "./ContactForm";

describe("ContactForm", () => {
  afterEach(cleanup);

  it("should render name and address inputs", () => {
    render(<ContactForm onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByPlaceholderText("Contact name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Q address")).toBeInTheDocument();
  });

  it("should render Save and Cancel buttons", () => {
    render(<ContactForm onSave={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("should call onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn<any>();
    render(<ContactForm onSave={vi.fn()} onCancel={onCancel} />);

    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("should call onSave with form data on valid submit", async () => {
    const onSave = vi.fn<any>();
    render(<ContactForm onSave={onSave} onCancel={vi.fn()} />);

    const nameInput = screen.getByPlaceholderText("Contact name");
    const addressInput = screen.getByPlaceholderText("Q address");

    await userEvent.type(nameInput, "Alice");
    await userEvent.type(addressInput, "Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000");

    const saveButton = screen.getByRole("button", { name: /Save/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    }, { timeout: 3000 });

    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: "Alice",
        address: "Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000",
      });
    });
  });

  it("should populate fields when editing", () => {
    render(
      <ContactForm
        initialContact={{
          name: "Bob",
          address: "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Contact name")).toHaveValue("Bob");
    expect(screen.getByPlaceholderText("Q address")).toHaveValue(
      "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
    );
  });

  it("should disable address field when editing", () => {
    render(
      <ContactForm
        initialContact={{
          name: "Bob",
          address: "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000",
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText("Q address")).toBeDisabled();
  });

  it("should show error for duplicate address", async () => {
    render(
      <ContactForm
        existingAddresses={["Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000"]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText("Contact name"),
      "Duplicate",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Q address"),
      "Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000",
    );

    await waitFor(() => {
      expect(
        screen.getByText("Contact with this address already exists"),
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Save/i })).toBeDisabled();
  });

  it("should allow editing contact without triggering duplicate for own address", async () => {
    const onSave = vi.fn<any>();
    render(
      <ContactForm
        initialContact={{
          name: "Alice",
          address: "Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000",
        }}
        existingAddresses={["Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000"]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    // Change the name — address stays the same (disabled), should not be flagged as duplicate
    const nameInput = screen.getByPlaceholderText("Contact name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Alice Updated");

    const saveButton = screen.getByRole("button", { name: /Save/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    }, { timeout: 3000 });

    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: "Alice Updated",
        address: "Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000",
      });
    });
  });
});
