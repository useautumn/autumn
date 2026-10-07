/** Runs `run` every `everySeconds`, starting on the same wall-clock boundary on every thread. */
export const alignedWindows = ({
	everySeconds,
	run,
}: {
	everySeconds: number;
	run: () => Promise<void>;
}): { stop(): void } => {
	const everyMs = everySeconds * 1000;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;
	function scheduleNext(): void {
		if (stopped) return;
		timer = setTimeout(
			async () => {
				await run().catch(() => {});
				scheduleNext();
			},
			everyMs - (Date.now() % everyMs),
		);
		timer.unref?.();
	}
	scheduleNext();
	return {
		stop: () => {
			stopped = true;
			clearTimeout(timer);
		},
	};
};
