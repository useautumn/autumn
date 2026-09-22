/** Full jitter: a retried failure that hit several callers at once must not
 * bring them all back in step. */
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
	return jitter ? Math.random() * ceiling : ceiling;
};
