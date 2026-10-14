import type { AlienConfig, AlienLogger } from "./alienClient.js";

export type AlienApi = {
	config: AlienConfig;
	baseUrl: string;
	apiKey: string | null;
};

export type AlienContext = { api: AlienApi; logger: AlienLogger };
