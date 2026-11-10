// @vitest-environment node
import { describe, expect, it } from "vitest";
import Web3 from "@theqrl/web3";
import {
  forwardCall,
  forwardEstimateGas,
  getSyncingResult,
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

describe("dApp qrl_estimateGas and qrl_call", () => {
  it.each([
    ["gasPrice", { from, to, data: "0x1234", gasPrice: "0x3b9aca00" }],
    [
      "gas that differs from gasLimit",
      { from, to, gas: "0x5208", gasLimit: "0x5209" },
    ],
    ["gas with gasPrice", { from, to, gas: "0x5208", gasPrice: "0x1" }],
  ])("forwards a request with %s to the node", async (_label, tx) => {
    const estimate = mockNode({ qrl_estimateGas: "0x5208" });
    expect(await forwardEstimateGas(estimate.provider, tx)).toBe("0x5208");
    expect(estimate.calls).toEqual([
      { method: "qrl_estimateGas", params: [tx] },
    ]);

    const call = mockNode({ qrl_call: "0x1234" });
    expect(await forwardCall(call.provider, tx, "latest")).toBe("0x1234");
    expect(call.calls).toEqual([
      { method: "qrl_call", params: [tx, "latest"] },
    ]);
  });

  it("defaults the block of a call to latest", async () => {
    const node = mockNode({ qrl_call: "0x" });
    await forwardCall(node.provider, { to, data: "0x" });
    expect(node.calls[0].params).toEqual([{ to, data: "0x" }, "latest"]);
  });

  it("shows why the web3 wrapper cannot be used: 2.0.0 rejects gasPrice locally", async () => {
    const node = mockNode({ qrl_chainId: "0x1", qrl_estimateGas: "0x5208" });
    const { qrl } = new Web3(node.provider);
    await expect(
      qrl.estimateGas({ from, to, gasPrice: "0x3b9aca00" } as never),
    ).rejects.toThrow();
    expect(node.calls.map((c) => c.method)).not.toContain("qrl_estimateGas");
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
