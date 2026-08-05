import { isConnectionLevelRedisError } from "./isTransientRedisError.js";

type PipelineResults = [Error | null, unknown][] | null;

/** Raises a socket-level pipeline failure so the caller can fail over.
 *  Per-command errors (WRONGTYPE, OOM) stay in the results, keeping the
 *  reader's invalidate-and-rebuild path as the thing that repairs the key. */
export const throwOnPipelineConnectionError = <T extends PipelineResults>(
	results: T,
): T => {
	if (!results) return results;
	for (const [error] of results) {
		if (error && isConnectionLevelRedisError({ error })) throw error;
	}
	return results;
};
