import { ms } from "@autumn/shared";

const DEFAULT_MIN_EDIT_INTERVAL_MS = ms.seconds(1.5);

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
		finalize: async () => {
			stopped = true;
			if (scheduled) clearTimeout(scheduled);
			scheduled = undefined;
			await inFlight;
		},
	};
};
