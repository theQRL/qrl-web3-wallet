import { mockedStore } from "@/__mocks__/mockedStore";
import { StoreProvider } from "@/stores/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ContactsPage from "./ContactsPage";

describe("ContactsPage", () => {
  afterEach(cleanup);

  const contactAddress =
    "Q0000000000000000000000000000000000000000000000000000000020b714091cf2a62dadda2847803e3f1b9d2d377900000000000000000000000000000000";
  const newContactAddress =
    "Q0000000000000000000000000000000000000000000000000000000020fb08ff1f1376a14c055e9f56df80563e16722b00000000000000000000000000000000";

  const renderComponent = (mockedStoreValues = mockedStore()) =>
    render(
      <StoreProvider value={mockedStoreValues}>
        <MemoryRouter>
          <ContactsPage />
        </MemoryRouter>
      </StoreProvider>,
    );

  it("should render the heading", () => {
    renderComponent();

    expect(screen.getByText("Contacts")).toBeInTheDocument();
  });

  it("should have a back button", () => {
    renderComponent();

    expect(screen.getByTestId("backButtonTestId")).toBeInTheDocument();
  });

  it("should have an Add button", () => {
    renderComponent();

    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  it("should show empty state when no contacts", () => {
    renderComponent();

    expect(screen.getByText("No contacts yet")).toBeInTheDocument();
  });

  it("should show contact form when Add is clicked", async () => {
    renderComponent();

    await userEvent.click(screen.getByText("Add"));

    expect(screen.getByPlaceholderText("Contact name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Q address")).toBeInTheDocument();
  });

  it("should render contacts from store", () => {
    renderComponent(
      mockedStore({
        contactsStore: {
          contacts: [
            {
              name: "Alice",
              address: contactAddress,
            },
          ],
        },
      }),
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("should show edit form when edit button is clicked", async () => {
    renderComponent(
      mockedStore({
        contactsStore: {
          contacts: [
            {
              name: "Alice",
              address: contactAddress,
            },
          ],
        },
      }),
    );

    await userEvent.click(screen.getByLabelText("Edit contact"));

    expect(screen.getByPlaceholderText("Contact name")).toHaveValue("Alice");
  });

  it("should call removeContact when delete button is clicked", async () => {
    const removeContact = vi.fn<any>(() => Promise.resolve());
    renderComponent(
      mockedStore({
        contactsStore: {
          contacts: [
            {
              name: "Alice",
              address: contactAddress,
            },
          ],
          removeContact,
        },
      }),
    );

    await userEvent.click(screen.getByLabelText("Delete contact"));

    expect(removeContact).toHaveBeenCalledWith(
      contactAddress,
    );
  });

  it("should call addContact when saving a new contact", async () => {
    const addContact = vi.fn<any>(() => Promise.resolve());
    renderComponent(
      mockedStore({
        contactsStore: {
          addContact,
        },
      }),
    );

    await userEvent.click(screen.getByText("Add"));

    await userEvent.type(
      screen.getByPlaceholderText("Contact name"),
      "Bob",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Q address"),
      newContactAddress,
    );

    const saveButton = screen.getByRole("button", { name: /Save/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    }, { timeout: 3000 });

    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(addContact).toHaveBeenCalledWith({
        name: "Bob",
        address: newContactAddress,
      });
    });

    // Form should be hidden after save
    expect(screen.queryByPlaceholderText("Contact name")).not.toBeInTheDocument();
  });

  it("should call updateContact when saving an edited contact", async () => {
    const updateContact = vi.fn<any>(() => Promise.resolve());
    renderComponent(
      mockedStore({
        contactsStore: {
          contacts: [
            {
              name: "Alice",
              address: contactAddress,
            },
          ],
          updateContact,
        },
      }),
    );

    await userEvent.click(screen.getByLabelText("Edit contact"));

    const nameInput = screen.getByPlaceholderText("Contact name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Alice Updated");

    const saveButton = screen.getByRole("button", { name: /Save/i });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    }, { timeout: 3000 });

    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(updateContact).toHaveBeenCalledWith(
        contactAddress,
        {
          name: "Alice Updated",
          address: contactAddress,
        },
      );
    });
  });

  it("should hide form when Cancel is clicked", async () => {
    renderComponent();

    await userEvent.click(screen.getByText("Add"));
    expect(screen.getByPlaceholderText("Contact name")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByPlaceholderText("Contact name")).not.toBeInTheDocument();
    // Add button should be visible again
    expect(screen.getByText("Add")).toBeInTheDocument();
  });
});
