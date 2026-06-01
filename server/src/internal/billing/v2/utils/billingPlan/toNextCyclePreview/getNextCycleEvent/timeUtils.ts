import { truncateMsToSecondPrecision } from "@autumn/shared";

export const SECOND_MS = 1000;

export const normalizeMs = (timestamp: number) =>
	truncateMsToSecondPrecision(timestamp);

export const timestampsEqual = (
	left: number | "now" | undefined | null,
	right: number,
) => typeof left === "number" && normalizeMs(left) === normalizeMs(right);

export const isFutureTimestamp = ({
	timestamp,
	nowMs,
}: {
	timestamp: number | undefined | null;
	nowMs: number;
}) =>
	timestamp !== undefined &&
	timestamp !== null &&
	normalizeMs(timestamp) > nowMs;
