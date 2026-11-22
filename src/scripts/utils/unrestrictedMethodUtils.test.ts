// @vitest-environment node
import { describe, expect, it } from "vitest";
import Web3 from "@theqrl/web3";
import {
  callForDapp,
  estimateGasForDapp,
  getSyncingResult,
  getTransactionFromBlockForDapp,
} from "./unrestrictedMethodUtils";

type Call = { method: string; params: unknown };

const mockNode = (results: Record<string, unknown>) => {
  const calls: Call[] = [];
  const provider = {
    request: async ({ method, params }: Call) => {
      calls.push({ method, params });
      if (!(method in results)) throw new Error(`unexpected ${method}`);
      return results[method];
    },
  };
  return { calls, provider };
};

const from = `Q${"ab".repeat(64)}`;
const to = `Q${"cd".repeat(64)}`;

// What the node received from the 1.0.3 wallet for each dApp request,
// recorded by running @theqrl/web3 1.0.3 against a mock node.
const wireCases: [string, Record<string, unknown>, Record<string, unknown>][] =
  [
    [
      "gasPrice",
      { from, to, data: "0x1234", gasPrice: "0x3b9aca00" },
      { from, to, data: "0x1234" },
    ],
    [
      "gas with gasPrice",
      { from, to, gas: "0x5208", gasPrice: "0x1", value: "0x1" },
      { from, to, gas: "0x5208", value: "0x1" },
    ],
    [
      "gas that differs from gasLimit",
      { from, to, gas: "0x5208", gasLimit: "0x5209" },
      { from, to, gas: "0x5209" },
    ],
    ["a numeric value", { to, value: 1000 }, { to, value: "0x3e8" }],
    ["a decimal string value", { to, value: "1000" }, { to, value: "0x3e8" }],
    ["a numeric gas", { to, gas: 21000 }, { to, gas: "0x5208" }],
    ["gasLimit only", { to, gasLimit: "0x5208" }, { to, gas: "0x5208" }],
  ];

describe.each(wireCases)("dApp request with %s", (_label, request, wire) => {
  it("reaches the node for qrl_estimateGas as it did on 1.0.3", async () => {
    const node = mockNode({ qrl_estimateGas: "0x5208" });
    const { qrl } = new Web3(node.provider);
    expect(
      await estimateGasForDapp(qrl, JSON.parse(JSON.stringify(request))),
    ).toBe("0x5208");
    expect(node.calls).toEqual([
      { method: "qrl_estimateGas", params: [wire, "latest"] },
    ]);
  });

  it.each([
    ["latest", "latest"],
    [16, "0x10"],
    ["0x10", "0x10"],
    [undefined, "latest"],
  ])(
    "reaches the node for qrl_call at block %j as it did on 1.0.3",
    async (block, wireBlock) => {
      const node = mockNode({ qrl_call: "0x1234" });
      const { qrl } = new Web3(node.provider);
      expect(
        await callForDapp(qrl, JSON.parse(JSON.stringify(request)), block),
      ).toBe("0x1234");
      expect(node.calls).toEqual([
        { method: "qrl_call", params: [wire, wireBlock] },
      ]);
    },
  );
});

it("does not mutate the request object", async () => {
  const node = mockNode({ qrl_estimateGas: "0x5208" });
  const { qrl } = new Web3(node.provider);
  const request = { from, to, gas: "0x1", gasLimit: "0x2", gasPrice: "0x3" };
  await estimateGasForDapp(qrl, request);
  expect(request).toEqual({
    from,
    to,
    gas: "0x1",
    gasLimit: "0x2",
    gasPrice: "0x3",
  });
});

describe("dApp qrl_syncing", () => {
  it("returns JSON quantities when the node reports sync progress", async () => {
    const node = mockNode({
      qrl_syncing: {
        startingBlock: "0x1",
        currentBlock: "0x2",
        highestBlock: "0x3",
      },
    });
    const { qrl } = new Web3(node.provider);
    // The raw web3 result holds BigInt values that cannot be serialised.
    const raw = await qrl.isSyncing();
    expect(() => JSON.stringify(raw)).toThrow();
    const result = await getSyncingResult(qrl);
    expect(result).toEqual({
      startingBlock: "0x1",
      currentBlock: "0x2",
      highestBlock: "0x3",
    });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(structuredClone(result)).toEqual(result);
  });

  it("returns false when the node is not syncing", async () => {
    const node = mockNode({ qrl_syncing: false });
    const { qrl } = new Web3(node.provider);
    expect(await getSyncingResult(qrl)).toBe(false);
  });
});

describe("a transaction by its position in a block", () => {
  const blockHash = `0x${"11".repeat(32)}`;
  const transaction = {
    blockHash,
    blockNumber: "0x10",
    chainId: "0x301825",
    from,
    gas: "0x5208",
    hash: `0x${"22".repeat(32)}`,
    input: "0x",
    maxFeePerGas: "0x3b9aca00",
    maxPriorityFeePerGas: "0x1",
    nonce: "0x7",
    to,
    transactionIndex: "0x0",
    type: "0x2",
    value: "0x3e8",
  };

  it.each([
    [
      "a block hash",
      blockHash,
      "qrl_getTransactionByBlockHashAndIndex",
      blockHash,
    ],
    ["a block number", 16, "qrl_getTransactionByBlockNumberAndIndex", "0x10"],
    [
      "a block tag",
      "latest",
      "qrl_getTransactionByBlockNumberAndIndex",
      "latest",
    ],
  ])("reaches the dApp for %s", async (_label, block, method, wireBlock) => {
    const node = mockNode({ [method]: transaction });
    const { qrl } = new Web3(node.provider);

    const result = await getTransactionFromBlockForDapp(qrl, block, 0);

    expect(result).toMatchObject({
      hash: transaction.hash,
      blockHash,
      nonce: "0x7",
      value: "0x3e8",
    });
    expect(node.calls).toEqual([{ method, params: [wireBlock, "0x0"] }]);
  });

  it("is null when the block has no transaction at that position", async () => {
    const node = mockNode({ qrl_getTransactionByBlockNumberAndIndex: null });
    const { qrl } = new Web3(node.provider);

    expect(await getTransactionFromBlockForDapp(qrl, 16, 5)).toBeNull();
  });
});
