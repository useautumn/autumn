import type { TinybirdApi } from "@tinybirdco/sdk";

export type TinybirdRegion = { baseUrl: string; token: string };

export type TinybirdClientConfig = {
	region: TinybirdRegion;
	/** One budget for a request and all of its retries, in milliseconds. */
	timeoutMs: number;
	/** Test seam; the global `fetch` otherwise. */
	fetch?: typeof fetch;
};

/** The official SDK's API client on one region, with gzipped event bodies. */
export type TinybirdClient = { api: TinybirdApi };
