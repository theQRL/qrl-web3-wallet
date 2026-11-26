import { describe, expect, it } from "vitest";
import { parseNftMetadata } from "./nftMetadataUtil";

describe("parseNftMetadata", () => {
  it("keeps well-formed metadata", () => {
    expect(
      parseNftMetadata({
        name: "Seven",
        description: "The seventh",
        image: "ipfs://QmImage",
        attributes: [
          { trait_type: "Color", value: "Blue" },
          { trait_type: "Level", value: 7 },
        ],
      }),
    ).toEqual({
      name: "Seven",
      description: "The seventh",
      image: "ipfs://QmImage",
      attributes: [
        { trait_type: "Color", value: "Blue" },
        { trait_type: "Level", value: 7 },
      ],
    });
  });

  it("leaves out fields that are not strings", () => {
    expect(
      parseNftMetadata({
        name: { first: "Seven" },
        description: 7,
        image: ["a"],
      }),
    ).toEqual({});
  });

  it("returns empty metadata for a value that is not an object", () => {
    expect(parseNftMetadata(null)).toEqual({});
    expect(parseNftMetadata("text")).toEqual({});
    expect(parseNftMetadata([1, 2])).toEqual({});
  });

  it("ignores attributes that are not a list", () => {
    expect(parseNftMetadata({ attributes: "Blue" })).toEqual({});
    expect(parseNftMetadata({ attributes: { trait_type: "a" } })).toEqual({});
  });

  it("drops attribute entries that cannot be shown", () => {
    expect(
      parseNftMetadata({
        attributes: [
          null,
          "Blue",
          { trait_type: "Color" },
          { trait_type: { a: 1 }, value: "x" },
          { trait_type: "Nested", value: { a: 1 } },
          { trait_type: "Level", value: 7 },
        ],
      }),
    ).toEqual({ attributes: [{ trait_type: "Level", value: 7 }] });
  });
});
