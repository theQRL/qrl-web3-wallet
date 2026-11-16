export type NFTStandard = "QRC721" | "QRC1155";

export type NFTCollectionType = {
  address: string;
  name: string;
  symbol: string;
  standard: NFTStandard;
  image: string;
};

export type NFTMetadata = {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
};

export type NFTTokenInfo = {
  tokenId: string;
  metadata?: NFTMetadata;
  imageUrl?: string;
};
