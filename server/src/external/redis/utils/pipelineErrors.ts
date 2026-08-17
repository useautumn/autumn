import { isConnectionLevelRedisError } from "./isTransientRedisError.js";

type PipelineResults = [Error | null, unknown][] | null;

/** A resolved `exec()` still reports a dead socket through its command tuples,
 *  so settling is not on its own proof the connection worked. */
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

/** Raises a socket-level pipeline failure so the caller can fail over.
 *  Per-command errors (WRONGTYPE, OOM) stay in the results, keeping the
 *  reader's invalidate-and-rebuild path as the thing that repairs the key. */
export const throwOnPipelineConnectionError = <T extends PipelineResults>(
	results: T,
): T => {
	const connectionError = firstPipelineConnectionError(results);
	if (connectionError) throw connectionError;
	return results;
};
