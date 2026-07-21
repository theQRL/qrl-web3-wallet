import type { Contact } from "@/types/contact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactItem from "./ContactItem";

describe("ContactItem", () => {
  afterEach(cleanup);

  const contact: Contact = {
    name: "Alice",
    address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
  };

  it("should render the contact name", () => {
    render(
      <ContactItem
        contact={contact}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("should render the contact address", () => {
    render(
      <ContactItem
        contact={contact}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000/),
    ).toBeInTheDocument();
  });

  it("should call onEdit when edit button is clicked", async () => {
    const onEdit = vi.fn<any>();
    render(
      <ContactItem contact={contact} onEdit={onEdit} onDelete={vi.fn()} />,
    );

    await userEvent.click(screen.getByLabelText("Edit contact"));
    expect(onEdit).toHaveBeenCalledWith(contact);
  });

  it("should call onDelete when delete button is clicked", async () => {
    const onDelete = vi.fn<any>();
    render(
      <ContactItem
        contact={contact}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await userEvent.click(screen.getByLabelText("Delete contact"));
    expect(onDelete).toHaveBeenCalledWith(contact.address);
  });
});
