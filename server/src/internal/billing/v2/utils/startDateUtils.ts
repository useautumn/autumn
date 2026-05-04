import { ms, secondsToMs } from "@autumn/shared";

const START_DATE_TOLERANCE_MS = ms.minutes(1);

export const isFutureStartDate = (
	startDate: number | undefined,
	currentEpochMs: number,
	toleranceMs = START_DATE_TOLERANCE_MS,
) => startDate !== undefined && startDate > currentEpochMs + toleranceMs;

export const isPastStartDate = (startDate: number, currentEpochMs: number) =>
	startDate < currentEpochMs - START_DATE_TOLERANCE_MS;

export const stripePhaseStartsInFuture = (
	startDate: number | "now" | undefined,
	currentEpochMs: number,
) =>
	typeof startDate === "number" &&
	isFutureStartDate(secondsToMs(startDate), currentEpochMs, 0);
