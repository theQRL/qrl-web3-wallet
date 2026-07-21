import type { Contact } from "@/types/contact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ContactList from "./ContactList";

describe("ContactList", () => {
  afterEach(cleanup);

  it("should show empty state when no contacts", () => {
    render(
      <ContactList contacts={[]} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(screen.getByText("No contacts yet")).toBeInTheDocument();
  });

  it("should render contact items", () => {
    const contacts: Contact[] = [
      {
        name: "Alice",
        address: "Q0000000000000000000000000000000000000000000000000000000020B714091cF2a62DADda2847803e3f1B9D2D377900000000000000000000000000000000",
      },
      {
        name: "Bob",
        address: "Q0000000000000000000000000000000000000000000000000000000020fB08fF1f1376A14C055E9F56df80563E16722b00000000000000000000000000000000",
      },
    ];

    render(
      <ContactList
        contacts={contacts}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});
