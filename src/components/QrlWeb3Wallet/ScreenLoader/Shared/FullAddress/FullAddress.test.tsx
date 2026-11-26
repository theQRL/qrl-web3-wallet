import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FullAddress from "./FullAddress";
import { QRL_EXAMPLE_ADDRESS, QRL_ADDRESS_LENGTH } from "@/constants/address";
import StringUtil from "@/utilities/stringUtil";

describe("FullAddress", () => {
  afterEach(cleanup);

  const rendered = (address: string) => {
    const { container } = render(<FullAddress address={address} />);
    return container.textContent;
  };

  it("should render every character of the address", () => {
    const text = rendered(QRL_EXAMPLE_ADDRESS);

    expect(text).toHaveLength(QRL_ADDRESS_LENGTH);
    // The checksummed form is what the user must be able to compare, so assert
    // against that rather than the input.
    expect(text).toBe(StringUtil.getDisplayAddress(QRL_EXAMPLE_ADDRESS));
  });

  it("should distinguish two addresses that share a long head and tail", () => {
    // This is the whole point of the component. Grinding a key until its visible
    // prefix and suffix match a target is far cheaper than a real 512-bit
    // collision, so any rendering that shows only the ends is not an identity.
    const body = QRL_EXAMPLE_ADDRESS.slice(1);
    const head = body.slice(0, 24);
    const tail = body.slice(-24);
    const a = `Q${head}${"a".repeat(body.length - 48)}${tail}`;
    const b = `Q${head}${"b".repeat(body.length - 48)}${tail}`;

    expect(a).toHaveLength(QRL_ADDRESS_LENGTH);
    expect(b).toHaveLength(QRL_ADDRESS_LENGTH);
    expect(rendered(a)).not.toBe(rendered(b));
  });

  it("should not clip the address with CSS", () => {
    // `truncate` (overflow-hidden + text-ellipsis + whitespace-nowrap) silently
    // hides the tail, which is worse than an explicit ellipsis because nothing
    // signals that characters are missing. See SECURITY.md, "Addresses".
    const { container } = render(<FullAddress address={QRL_EXAMPLE_ADDRESS} />);
    const classes = Array.from(container.querySelectorAll("*")).flatMap((el) =>
      Array.from(el.classList),
    );

    expect(classes).not.toContain("truncate");
    expect(classes).not.toContain("text-ellipsis");
    expect(classes).not.toContain("overflow-hidden");
    expect(classes).not.toContain("whitespace-nowrap");
  });

  it("should wrap rather than overflow, by splitting into separate elements", () => {
    // Separate elements are what let the address wrap in a narrow popup. A single
    // unbreakable string is what forced the clipping this component replaced.
    const { container } = render(<FullAddress address={QRL_EXAMPLE_ADDRESS} />);

    expect(container.querySelectorAll("span").length).toBeGreaterThan(10);
  });

  it("should keep caller classes without letting them clip", () => {
    const { container } = render(
      <FullAddress address={QRL_EXAMPLE_ADDRESS} className="font-mono text-xs" />,
    );
    const wrapper = container.firstElementChild;

    expect(wrapper).toHaveClass("font-mono", "text-xs", "flex", "flex-wrap");
    expect(container.textContent).toHaveLength(QRL_ADDRESS_LENGTH);
  });
});
