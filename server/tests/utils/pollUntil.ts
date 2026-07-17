// Resolves early once fn() is true; on deadline expiry resolves silently
// so callers degrade to the old fixed-wait behavior instead of failing.
export const pollUntil = async (
	fn: () => Promise<boolean>,
	{ deadlineMs, intervalMs = 2000 }: { deadlineMs: number; intervalMs?: number },
): Promise<void> => {
	const deadline = Date.now() + deadlineMs;
	while (Date.now() < deadline) {
		try {
			if (await fn()) return;
		} catch {
			// Treat errors as "not ready yet" and keep polling.
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
};
