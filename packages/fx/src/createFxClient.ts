import type { FxClient, FxClientConfig } from "./types/fxClient.js";

const OPEN_EXCHANGE_RATES_BASE_URL = "https://openexchangerates.org/api";

export const createFxClient = ({
	config,
}: {
	config: FxClientConfig;
}): FxClient => ({
	appId: config.appId,
	baseUrl: config.baseUrl ?? OPEN_EXCHANGE_RATES_BASE_URL,
	fetch: config.fetch ?? globalThis.fetch,
	rateTables: new Map(),
});
