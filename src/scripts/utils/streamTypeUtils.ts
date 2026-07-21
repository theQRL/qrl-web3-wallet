import type { Duplex } from "readable-stream";

type StreamLifecycle = Duplex & {
  setMaxListeners: (n: number) => unknown;
  removeAllListeners: (event?: string | symbol) => unknown;
  destroy: (error?: Error) => unknown;
};

export const asDuplexStream = (stream: unknown): Duplex => stream as Duplex;

export const asStreamLifecycle = (stream: unknown): StreamLifecycle =>
  stream as StreamLifecycle;
