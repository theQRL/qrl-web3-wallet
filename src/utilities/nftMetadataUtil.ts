import type { NFTMetadata } from "@/types/nft";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the token metadata a contract points at. That JSON is written by
 * whoever controls the contract, so every field is checked before the
 * screens render it. A field of another type is left out; handed to React,
 * an object child throws and the screen turns into an error page.
 */
export function parseNftMetadata(raw: unknown): NFTMetadata {
  if (!isRecord(raw)) return {};

  const metadata: NFTMetadata = {};
  if (typeof raw.name === "string") metadata.name = raw.name;
  if (typeof raw.description === "string") {
    metadata.description = raw.description;
  }
  if (typeof raw.image === "string") metadata.image = raw.image;

  if (Array.isArray(raw.attributes)) {
    const entries: unknown[] = raw.attributes;
    const attributes: NonNullable<NFTMetadata["attributes"]> = [];
    for (const attribute of entries) {
      if (
        isRecord(attribute) &&
        typeof attribute.trait_type === "string" &&
        (typeof attribute.value === "string" ||
          typeof attribute.value === "number")
      ) {
        attributes.push({
          trait_type: attribute.trait_type,
          value: attribute.value,
        });
      }
    }
    metadata.attributes = attributes;
  }

  return metadata;
}
