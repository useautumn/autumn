/** Equal jitter: half the ceiling is always waited, so a caller riding out a
 * dead connection keeps a guaranteed floor, and the other half is spread so
 * several callers that failed together don't return in step. */
export const backoffDelayMs = ({
	attempt,
	baseDelayMs,
	maxDelayMs,
	jitter = true,
}: {
	attempt: number;
	baseDelayMs: number;
	maxDelayMs: number;
	jitter?: boolean;
}) => {
	const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
	return jitter ? ceiling / 2 + (Math.random() * ceiling) / 2 : ceiling;
};
