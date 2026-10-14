/** Exponential backoff for eve restarts, capped at `maxRestarts` per rolling `windowMs`. */
export const createRestartBudget = ({
	maxRestarts,
	windowMs,
	baseDelayMs,
	maxDelayMs,
	now = Date.now,
}: {
	maxRestarts: number;
	windowMs: number;
	baseDelayMs: number;
	maxDelayMs: number;
	now?: () => number;
}) => {
	const restartedAt: number[] = [];
	/** The delay before the next restart, or undefined once the cap is spent. */
	const nextDelayMs = () => {
		const at = now();
		while (restartedAt.length > 0 && at - restartedAt[0] >= windowMs) {
			restartedAt.shift();
		}
		if (restartedAt.length >= maxRestarts) return undefined;
		const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** restartedAt.length);
		restartedAt.push(at);
		return delayMs;
	};
	return { nextDelayMs };
};

export type RestartBudget = ReturnType<typeof createRestartBudget>;
