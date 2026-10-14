import type { TinybirdApi } from "@tinybirdco/sdk";

export type TinybirdRegion = { baseUrl: string; token: string };

export type TinybirdClientConfig = {
	region: TinybirdRegion;
	timeoutMs: number;
	fetch?: typeof fetch;
};

export type TinybirdClient = { api: TinybirdApi };
