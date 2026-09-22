import {
	addMilliseconds,
	differenceInMilliseconds,
	isAfter,
	milliseconds,
} from "date-fns";

/** Concurrency alone doesn't bound the request rate: N workers whose calls
 * return instantly issue far more than N requests per second. */
export const createRatePacer = ({
	requestsPerSecond,
}: {
	requestsPerSecond: number;
}) => {
	const minIntervalMs = milliseconds({ seconds: 1 }) / requestsPerSecond;
	let nextSlot = new Date(0);

	const takeSlot = async () => {
		const now = new Date();
		const slot = isAfter(nextSlot, now) ? nextSlot : now;
		nextSlot = addMilliseconds(slot, minIntervalMs);

		const waitMs = differenceInMilliseconds(slot, now);
		if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
	};

	return { takeSlot };
};

export type RatePacer = ReturnType<typeof createRatePacer>;
