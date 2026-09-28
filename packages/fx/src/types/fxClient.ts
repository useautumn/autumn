import type { UsdRateTable } from "./usdRateTable.js";

export type FxClientConfig = {
	/** Open Exchange Rates app id. Secret: never log it or put it in an error. */
	appId: string;
	baseUrl?: string;
	fetch?: typeof fetch;
};

/** Handle on the rates provider. Historical tables never change, so fetched days are kept for the client's lifetime. */
export type FxClient = {
	appId: string;
	baseUrl: string;
	fetch: typeof fetch;
	rateTables: Map<string, UsdRateTable>;
};
