/**
 * Validates that a timestamp is in milliseconds (not seconds).
 * Returns true if valid, false otherwise.
 */
export const isValidMsTimestamp = (unixTimestamp: number): boolean => {
	// Millisecond timestamps from ~2001 onwards are > 10^12
	// Second timestamps won't reach 10^12 until year ~33658
	const MIN_MS_TIMESTAMP = 1_000_000_000_000; // ~Sept 2001 in ms
	const MAX_MS_TIMESTAMP = 10_000_000_000_000; // ~Nov 2286 in ms

	if (unixTimestamp < MIN_MS_TIMESTAMP) {
		return false; // Likely in seconds, not milliseconds
	}

	if (unixTimestamp > MAX_MS_TIMESTAMP) {
		return false; // Too large to be valid
	}

	return true;
};

/**
 * Validates that a timestamp is in seconds, then converts to milliseconds.
 * Returns undefined if input is undefined or not a valid seconds timestamp.
 */
export const secondsToMs = (
	seconds: number | undefined,
): number | undefined => {
	if (seconds === undefined) {
		return undefined;
	}

	// Seconds timestamps are currently ~10 digits (1.7 billion)
	// They won't reach 10^12 until year ~33658
	const MIN_SEC_TIMESTAMP = 0;
	const MAX_SEC_TIMESTAMP = 10_000_000_000; // ~Nov 2286 in seconds

	if (seconds < MIN_SEC_TIMESTAMP || seconds > MAX_SEC_TIMESTAMP) {
		return undefined; // Not a valid seconds timestamp
	}

	return seconds * 1000;
};

export const msToSeconds = (ms: number): number => {
	return Math.floor(ms / 1000);
};
