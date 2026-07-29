const MAX_COOLDOWN_SECONDS = 60 * 60;

const toSeconds = (value: unknown): number | null => {
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		return Math.min(Math.ceil(value), MAX_COOLDOWN_SECONDS);
	}
	if (typeof value !== "string" || !value.trim()) return null;

	const numeric = Number(value);
	if (Number.isFinite(numeric) && numeric >= 0) {
		return Math.min(Math.ceil(numeric), MAX_COOLDOWN_SECONDS);
	}

	// `Retry-After` may also be an HTTP date.
	const date = Date.parse(value);
	if (Number.isNaN(date)) return null;
	const diff = Math.ceil((date - Date.now()) / 1000);
	if (diff <= 0) return null;
	return Math.min(diff, MAX_COOLDOWN_SECONDS);
};

/**
 * Reads retry information from a rate-limited domain verification response.
 * Duck-typed rather than keyed off AxiosError so it works for any transport and
 * for both header- and body-carried retry hints.
 */
export const getSsoRetryAfterSeconds = (error: unknown): number | null => {
	const response = (error as { response?: unknown } | null | undefined)
		?.response as
		| {
				status?: number;
				headers?: Record<string, unknown>;
				data?: Record<string, unknown>;
		  }
		| undefined;
	if (!response) return null;

	const candidates = [
		response.headers?.["retry-after"],
		response.headers?.["Retry-After"],
		response.data?.retryAfter,
		response.data?.retry_after,
		response.data?.retryAfterSeconds,
		response.data?.retry_after_seconds,
	];

	for (const candidate of candidates) {
		const seconds = toSeconds(candidate);
		if (seconds !== null) return seconds;
	}

	return null;
};

export const isRateLimitError = (error: unknown) =>
	(error as { response?: { status?: number } } | null | undefined)?.response
		?.status === 429;

export const formatCooldown = (seconds: number) => {
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
};
