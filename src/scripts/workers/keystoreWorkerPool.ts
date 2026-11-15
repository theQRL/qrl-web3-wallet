/**
 * Helpers for fanning keystore KDF work out over multiple Web Workers so N
 * keystores decrypt concurrently instead of back to back in one thread.
 *
 * Concurrency is capped independently of core count because every in-flight
 * argon2id derivation at the production parameters (m=262144 KiB) pins
 * ~256 MiB of memory for its duration.
 */

const MAX_KDF_WORKERS = 3;

export function kdfWorkerCount(itemCount: number): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 2;
  return Math.max(1, Math.min(itemCount, cores, MAX_KDF_WORKERS));
}

/**
 * Split items into at most chunkCount contiguous chunks. Contiguous so that
 * concatenating per-chunk results in chunk order reproduces the original
 * item order.
 */
export function splitIntoChunks<T>(items: T[], chunkCount: number): T[][] {
  const chunks: T[][] = [];
  const base = Math.floor(items.length / chunkCount);
  const extra = items.length % chunkCount;
  let offset = 0;
  for (let i = 0; i < chunkCount; i++) {
    const size = base + (i < extra ? 1 : 0);
    if (size === 0) continue;
    chunks.push(items.slice(offset, offset + size));
    offset += size;
  }
  return chunks;
}

/**
 * Post one request to a fresh worker, resolve with its single response, and
 * terminate the worker either way. Worker-level errors resolve with the
 * caller-supplied failure value so Promise.all over chunks never rejects.
 */
export function runWorkerJob<TRequest, TResponse>(
  createWorker: () => Worker,
  request: TRequest,
  failureResponse: TResponse,
): Promise<TResponse> {
  return new Promise((resolve) => {
    const worker = createWorker();
    worker.onmessage = (event: MessageEvent<TResponse>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(failureResponse);
    };
    worker.postMessage(request);
  });
}
