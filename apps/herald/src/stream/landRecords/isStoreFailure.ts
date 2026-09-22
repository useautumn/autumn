import { isTinybirdError } from "@autumn/tinybird";

const SOCKET_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT",
]);

/** The store answered, or the wire to it broke: nothing about the records themselves. Postgres errors carry a SQLSTATE in `errno`. */
export const isStoreFailure = (cause: unknown): boolean => {
	if (isTinybirdError(cause)) return true;
	if (!(cause instanceof Error)) return false;
	const { errno, code } = cause as Error & { errno?: unknown; code?: unknown };
	if (typeof errno === "string") return true;
	return typeof code === "string" && SOCKET_CODES.has(code);
};
