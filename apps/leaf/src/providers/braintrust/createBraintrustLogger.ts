import { initLogger, type Logger } from "braintrust";
import { braintrustConfig } from "./config.js";

export const createBraintrustLogger = ({
	apiKey = process.env.BRAINTRUST_API_KEY,
	enabled = braintrustConfig.enabled,
	projectName = braintrustConfig.projectName,
}: {
	apiKey?: string;
	enabled?: boolean;
	projectName?: string;
} = {}): Logger<true> | undefined => {
	if (!enabled || !apiKey) return undefined;
	return initLogger({ apiKey, projectName });
};
