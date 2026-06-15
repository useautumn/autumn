const DEFAULT_MIN_EDIT_INTERVAL_MS = 1500;

// Slack tolerates ~1 chat.update/sec per channel; coalesce bursts into a
// leading edit plus one trailing edit per interval.
export const createThrottledCardEditor = ({
	edit,
	minIntervalMs = DEFAULT_MIN_EDIT_INTERVAL_MS,
}: {
	edit: () => Promise<void>;
	minIntervalMs?: number;
}) => {
	let lastEditAt = 0;
	let scheduled: ReturnType<typeof setTimeout> | undefined;
	let inFlight: Promise<void> = Promise.resolve();
	let stopped = false;

	const flush = () => {
		scheduled = undefined;
		if (stopped) return;
		lastEditAt = Date.now();
		inFlight = edit().catch(() => {});
	};

	return {
		requestEdit: () => {
			if (stopped || scheduled) return;
			const wait = lastEditAt + minIntervalMs - Date.now();
			if (wait <= 0) {
				flush();
				return;
			}
			scheduled = setTimeout(flush, wait);
		},
		/** Cancels pending edits and waits for the in-flight one, so a final edit can't be overwritten. */
		finalize: async () => {
			stopped = true;
			if (scheduled) clearTimeout(scheduled);
			scheduled = undefined;
			await inFlight;
		},
	};
};
