import type { AlienConfig, AlienLogger } from "./alienClient.js";

/** Where one client's requests go, and how they authenticate. */
export type AlienApi = {
	config: AlienConfig;
	baseUrl: string;
	apiKey: string | null;
};

/** A call's manager, and where it reports what it skipped. */
export type AlienContext = { api: AlienApi; logger: AlienLogger };
