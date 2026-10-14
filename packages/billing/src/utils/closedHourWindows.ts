import type { HourWindow } from "../types/hourWindow";

const HOUR_MS = 60 * 60 * 1000;

export const closedHourWindows = ({
	nowMs,
	count,
}: {
	nowMs: number;
	count: number;
}): HourWindow[] => {
	const latestClosedEndMs = Math.floor(nowMs / HOUR_MS) * HOUR_MS;

	return Array.from({ length: count }, (_, index) => {
		const endMs = latestClosedEndMs - (count - 1 - index) * HOUR_MS;
		return { startMs: endMs - HOUR_MS, endMs };
	});
};
