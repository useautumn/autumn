// Single server-side entry point for every Context.dev call. Keep all
// Context.dev requests routed through here (auth, retries, error mapping) —
// never call api.context.dev directly from handlers, and never expose
// CONTEXT_DEV_API_KEY to the browser bundle.
// Docs: https://docs.context.dev
import { InternalError } from "@autumn/shared";

const CONTEXT_DEV_BASE_URL = "https://api.context.dev/v1";
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const MAX_RETRY_AFTER_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

export type ContextDevLogo = {
	url: string;
	mode?: "light" | "dark" | "has_opaque_background";
	type?: "icon" | "logo";
	resolution?: { width?: number; height?: number; aspect_ratio?: number };
};

export type ContextDevBrand = {
	domain?: string;
	title?: string;
	logos?: ContextDevLogo[];
};

export class ContextDevError extends Error {
	status: number;

	constructor({ message, status }: { message: string; status: number }) {
		super(message);
		this.status = status;
	}
}

export const isContextDevConfigured = () =>
	Boolean(process.env.CONTEXT_DEV_API_KEY);

const getApiKey = () => {
	const apiKey = process.env.CONTEXT_DEV_API_KEY;
	if (!apiKey) {
		throw new InternalError({
			message: "Context.dev is not configured",
			code: "context_dev_not_configured",
		});
	}
	return apiKey;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableStatus = (status: number) =>
	status === 408 || status === 429 || status >= 500;

const getRetryDelayMs = ({
	response,
	attempt,
}: {
	response?: Response;
	attempt: number;
}) => {
	const retryAfter = response?.headers.get("retry-after");
	const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
	if (Number.isFinite(retryAfterSeconds)) {
		return Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS);
	}
	return BASE_BACKOFF_MS * 2 ** attempt;
};

const contextDevRequest = async <T>({
	method,
	path,
	body,
}: {
	method: "GET" | "POST";
	path: string;
	body?: unknown;
}): Promise<T> => {
	const apiKey = getApiKey();

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
		let response: Response;

		try {
			response = await fetch(`${CONTEXT_DEV_BASE_URL}${path}`, {
				method,
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		} catch (error) {
			// Network error / timeout — treat like a 5xx.
			if (isLastAttempt) {
				throw new ContextDevError({
					message: `Context.dev request failed: ${(error as Error).message}`,
					status: 503,
				});
			}
			await sleep(getRetryDelayMs({ attempt }));
			continue;
		}

		if (response.ok) {
			return (await response.json()) as T;
		}

		if (isRetryableStatus(response.status) && !isLastAttempt) {
			await sleep(getRetryDelayMs({ response, attempt }));
			continue;
		}

		const errorBody = (await response.json().catch(() => null)) as {
			message?: string;
		} | null;
		throw new ContextDevError({
			message: errorBody?.message || `Context.dev returned ${response.status}`,
			status: response.status,
		});
	}

	throw new ContextDevError({
		message: "Context.dev request failed",
		status: 503,
	});
};

/** POST /brand/retrieve — https://docs.context.dev/api-reference/brand-intelligence/brand */
export const retrieveBrandByDomain = async ({
	domain,
}: {
	domain: string;
}): Promise<ContextDevBrand | null> => {
	const data = await contextDevRequest<{ brand?: ContextDevBrand }>({
		method: "POST",
		path: "/brand/retrieve",
		body: { type: "by_domain", domain },
	});
	return data.brand ?? null;
};
