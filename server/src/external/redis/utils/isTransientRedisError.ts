import { RedisUnavailableError } from "./errors.js";

const TRANSIENT_REDIS_ERROR_MESSAGES = new Set(["Command timed out"]);
const TRANSIENT_REDIS_ERROR_NAMES = new Set(["MaxRetriesPerRequestError"]);

export const isTransientRedisError = ({
	error,
}: {
	error: unknown;
}): boolean => {
	if (error instanceof RedisUnavailableError) return true;
	if (!(error instanceof Error)) return false;
	if (TRANSIENT_REDIS_ERROR_MESSAGES.has(error.message)) return true;
	return TRANSIENT_REDIS_ERROR_NAMES.has(error.name);
};
