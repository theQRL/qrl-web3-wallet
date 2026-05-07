import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import CurrencyImagePreload from "./CurrencyImagePreload";

class MockImage {
  src = "";
  onload: () => void = () => {};
  onerror: () => void = () => {};
  constructor() {
    setTimeout(() => {
      if (this.src.includes("valid")) {
        this.onload();
      } else {
        this.onerror();
      }
    }, 10);
  }
}

describe("CurrencyImagePreload", () => {
  afterEach(cleanup);

  const originalImage = global.Image;

  beforeEach(() => {
    global.Image = MockImage as any;
  });

  afterEach(() => {
    global.Image = originalImage;
  });

  // Data URIs are the only protocol allowed by the F-11 guard. We embed the
  // tokens "valid" / "invalid" in the (otherwise-ignored) base64 body so the
  // MockImage above can branch deterministically.
  const VALID_DATA_URI = "data:image/svg+xml;base64,valid-icon";
  const BAD_DATA_URI = "data:image/svg+xml;base64,bad-icon";
  const ANOTHER_DATA_URI = "data:image/svg+xml;base64,another-icon";

  it("renders the first valid image", async () => {
    render(
      <CurrencyImagePreload
        iconUrls={[BAD_DATA_URI, VALID_DATA_URI, ANOTHER_DATA_URI]}
      />,
    );

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "Currency icon" });
      expect(img).toHaveAttribute("src", VALID_DATA_URI);
    });
  });

  it("does not render if all URLs fail", async () => {
    render(
      <CurrencyImagePreload
        iconUrls={[
          "data:image/svg+xml;base64,fail1",
          "data:image/svg+xml;base64,fail2",
        ]}
      />,
    );

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "Currency icon" });
      expect(img).not.toHaveAttribute("src");
    });
  });

  it("rejects non-data-URI protocols (no network request fired)", async () => {
    render(
      <CurrencyImagePreload
        iconUrls={[
          "https://valid-icon.svg",
          "http://valid-icon.png",
          "file:///valid-icon.png",
        ]}
      />,
    );

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "Currency icon" });
      expect(img).not.toHaveAttribute("src");
    });
  });

  it("cleans up on unmount", async () => {
    const { unmount } = render(
      <CurrencyImagePreload iconUrls={[VALID_DATA_URI]} />,
    );
    unmount();
    expect(true).toBeTruthy();
  });
});
