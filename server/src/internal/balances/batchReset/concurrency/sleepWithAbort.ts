/** Sleeps for delayMs, resolving early if the signal aborts. */
export const sleepWithAbort = async ({
	delayMs,
	signal,
}: {
	delayMs: number;
	signal: AbortSignal;
}) => {
	if (signal.aborted) return;
	await new Promise<void>((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", finish);
			resolve();
		};
		const timer = setTimeout(finish, delayMs);
		signal.addEventListener("abort", finish, { once: true });
	});
};
