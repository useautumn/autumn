import type { UsdRateTable } from "./usdRateTable.js";

export type FxClientConfig = {
	appId: string;
	baseUrl?: string;
	fetch?: typeof fetch;
};

export type FxClient = {
	appId: string;
	baseUrl: string;
	fetch: typeof fetch;
	rateTables: Map<string, UsdRateTable>;
};
