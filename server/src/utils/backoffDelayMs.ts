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
