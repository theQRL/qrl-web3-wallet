import PhishingDetector from "eth-phishing-detect/src/detector";
import browser from "webextension-polyfill";
// Snapshot of MetaMask's eth-phishing-detect config taken at build time.
// Acts as a cold-start fallback when the network fetch and the persistent
// cache are both unavailable, so the wallet always has a baseline blocklist
// to consult before the dApp approval popup renders.
import bundledPhishingConfig from "./defaultPhishingConfig.json";

const PHISHING_CONFIG_URL =
  "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/master/src/config.json";
const PHISHING_CACHE_KEY = "PHISHING_BLOCKLIST_CACHE";
const PHISHING_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
export const PHISHING_ALARM_NAME = "QRL_PHISHING_REFRESH";

export type PhishingDetectorStatus = "ready" | "initializing" | "unavailable";

export type PhishingCheckResult = {
  isDomainPhishing: boolean;
  matchType?: string;
  matchedDomain?: string;
  detectorStatus?: PhishingDetectorStatus;
};

type PhishingConfig = {
  whitelist?: string[];
  blacklist?: string[];
  fuzzylist?: string[];
  tolerance?: number;
};

type CachedConfig = {
  config: PhishingConfig;
  timestamp: number;
};

let detectorInstance: InstanceType<typeof PhishingDetector> | null = null;
let detectorStatus: PhishingDetectorStatus = "initializing";
let retryTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

export function getPhishingDetectorStatus(): PhishingDetectorStatus {
  return detectorStatus;
}

async function fetchRemoteConfig(): Promise<PhishingConfig | null> {
  try {
    const response = await fetch(PHISHING_CONFIG_URL);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("QrlWeb3Wallet: Failed to fetch phishing blocklist", error);
    return null;
  }
}

async function getCachedConfig(): Promise<CachedConfig | null> {
  const data = await browser.storage.local.get(PHISHING_CACHE_KEY);
  return (data?.[PHISHING_CACHE_KEY] as CachedConfig) ?? null;
}

async function setCachedConfig(config: PhishingConfig): Promise<void> {
  const cached: CachedConfig = { config, timestamp: Date.now() };
  await browser.storage.local.set({ [PHISHING_CACHE_KEY]: cached });
}

function createDetector(config: PhishingConfig) {
  return new PhishingDetector([
    {
      allowlist: config.whitelist ?? [],
      blocklist: config.blacklist ?? [],
      fuzzylist: config.fuzzylist ?? [],
      tolerance: config.tolerance ?? 3,
      name: "MetaMask",
      version: 1,
    },
  ]);
}

// Exponential-backoff retry schedule when initial fetch + cache fetch both fail
// (F-4). Avoids waiting the full 24h alarm interval before retrying.
const RETRY_DELAYS_MS = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  60 * 60 * 1000,
];
let retryAttempt = 0;

function scheduleRetry(): void {
  if (retryTimeoutHandle !== undefined) {
    clearTimeout(retryTimeoutHandle);
  }
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryTimeoutHandle = setTimeout(() => {
    retryAttempt += 1;
    void initializePhishingDetector();
  }, delay);
}

export async function initializePhishingDetector(): Promise<void> {
  if (detectorInstance === null) {
    detectorStatus = "initializing";
  }
  const cached = await getCachedConfig();
  const isCacheStale =
    !cached || Date.now() - cached.timestamp > PHISHING_CACHE_TTL;

  if (isCacheStale) {
    const remoteConfig = await fetchRemoteConfig();
    if (remoteConfig) {
      await setCachedConfig(remoteConfig);
      detectorInstance = createDetector(remoteConfig);
      detectorStatus = "ready";
      retryAttempt = 0;
      return;
    }
  }

  if (cached?.config) {
    detectorInstance = createDetector(cached.config);
    detectorStatus = "ready";
    retryAttempt = 0;
    return;
  }

  // Remote fetch and persistent cache both failed. Fall back to the
  // bundled snapshot so a baseline blocklist is always available, then
  // schedule a retry to refresh against the live upstream.
  detectorInstance = createDetector(bundledPhishingConfig as PhishingConfig);
  detectorStatus = "ready";
  scheduleRetry();
}

export function checkDomain(url: string): PhishingCheckResult {
  if (!detectorInstance) {
    // Surface degraded state to the UI so the dApp request popup can warn the
    // user that phishing detection is unavailable, rather than implying a
    // clean check (F-4).
    return { isDomainPhishing: false, detectorStatus };
  }

  try {
    const hostname = new URL(url).hostname;

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    ) {
      return { isDomainPhishing: false, detectorStatus };
    }

    const result = detectorInstance.check(hostname);
    return {
      isDomainPhishing: result.result,
      matchType: result.type,
      matchedDomain: result.match,
      detectorStatus,
    };
  } catch {
    return { isDomainPhishing: false, detectorStatus };
  }
}

export async function setupPhishingRefreshAlarm(): Promise<void> {
  await browser.alarms.create(PHISHING_ALARM_NAME, {
    periodInMinutes: 24 * 60,
  });
}

export async function handlePhishingRefreshAlarm(): Promise<void> {
  await initializePhishingDetector();
}
