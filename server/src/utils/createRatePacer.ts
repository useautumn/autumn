/** Concurrency alone doesn't bound the request rate: N workers whose calls
 * return instantly issue far more than N requests per second. */
export const createRatePacer = ({
	requestsPerSecond,
}: {
	requestsPerSecond: number;
}) => {
	const minIntervalMs = 1000 / requestsPerSecond;
	let nextSlotMs = 0;

	const takeSlot = async () => {
		const now = Date.now();
		const slotMs = Math.max(now, nextSlotMs);
		nextSlotMs = slotMs + minIntervalMs;
		const waitMs = slotMs - now;
		if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
	};

	return { takeSlot };
};

export type RatePacer = ReturnType<typeof createRatePacer>;
