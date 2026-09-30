type StripeLikeError = {
	message?: string;
	type?: string;
	code?: string;
	/** Set by @tw/image/nuke-accounts.mjs raw-fetch errors. */
	stripeCode?: string;
	statusCode?: number;
	status?: number;
	requestId?: string;
};

const asStripeError = (error: unknown): StripeLikeError =>
	typeof error === "object" && error !== null ? (error as StripeLikeError) : {};

const errorCode = (error: unknown): string | undefined => {
	const e = asStripeError(error);
	return e.code ?? e.stripeCode;
};

/** Same fields scripts/tw/probe-stripe-keys.ts prints for a failing key. */
export const describeStripeError = (error: unknown): string => {
	const e = asStripeError(error);
	const parts = [
		e.type && `type=${e.type}`,
		e.statusCode && `status=${e.statusCode}`,
		e.code && `code=${e.code}`,
		e.requestId && `req=${e.requestId}`,
	].filter(Boolean);
	return `${e.message ?? String(error)}${parts.length ? ` [${parts.join(" ")}]` : ""}`;
};

/** Short, human-readable reason stored in stripe_accounts.broken_reason. */
export const brokenReasonFrom = (error: unknown): string => {
	const code = errorCode(error);
	const message = asStripeError(error).message ?? String(error);
	return `${code ? `${code}: ` : ""}${message}`.slice(0, 500);
};

/** The connected account was deleted, or the platform key lost access to it. */
export const isAccountGone = (error: unknown): boolean => {
	const code = errorCode(error);
	if (code === "account_invalid" || code === "resource_missing") return true;
	const message = asStripeError(error).message ?? "";
	return /does not have access to account|no such account/i.test(message);
};

export const isRateLimited = (error: unknown): boolean => {
	const e = asStripeError(error);
	return (
		e.statusCode === 429 ||
		e.status === 429 ||
		errorCode(error) === "rate_limit" ||
		e.type === "StripeRateLimitError"
	);
};

const RATE_LIMIT_TRIES = 6;

/** Retries 429s with exponential backoff + jitter; anything else throws immediately. */
export const withRateLimitRetry = async <T>(
	request: () => Promise<T>,
): Promise<T> => {
	for (let attempt = 1; ; attempt++) {
		try {
			return await request();
		} catch (error) {
			if (!isRateLimited(error) || attempt >= RATE_LIMIT_TRIES) throw error;
			const backoffMs =
				Math.min(16_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
			await new Promise((resolve) => setTimeout(resolve, backoffMs));
		}
	}
};
