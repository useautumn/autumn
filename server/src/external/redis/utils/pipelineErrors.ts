import { isConnectionLevelRedisError } from "./isTransientRedisError.js";

type PipelineResults = [Error | null, unknown][] | null;

export const firstPipelineConnectionError = (
	results: unknown,
): Error | undefined => {
	if (!Array.isArray(results)) return undefined;
	for (const entry of results) {
		const error = Array.isArray(entry) ? entry[0] : undefined;
		if (error && isConnectionLevelRedisError({ error })) return error as Error;
	}
	return undefined;
};

export const throwOnPipelineConnectionError = <T extends PipelineResults>(
	results: T,
): T => {
	const connectionError = firstPipelineConnectionError(results);
	if (connectionError) throw connectionError;
	return results;
};
