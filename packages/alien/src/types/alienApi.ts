import type { AlienConfig } from "./alienClient.js";

/** Where one client's requests go, and how they authenticate. */
export type AlienApi = {
	config: AlienConfig;
	baseUrl: string;
	apiKey: string | null;
};
