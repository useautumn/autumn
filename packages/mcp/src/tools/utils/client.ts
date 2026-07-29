import {
	type AutumnMcpAuth,
	createAutumnClient,
} from "../../server/auth/auth.js";

const parseBody = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

// ~150k tokens; an unguarded page (e.g. listCustomers limit 1000) can exceed
// the model's context outright, hard-failing the whole turn.
const MAX_RESPONSE_CHARS = 600_000;

const guardResponseSize = ({
	body,
	endpoint,
	size,
}: {
	body: unknown;
	endpoint: string;
	size: number;
}): unknown => {
	if (size <= MAX_RESPONSE_CHARS) return body;
	return {
		error: true,
		message: `Result from ${endpoint} is too large to process (${size} characters). Retry with a smaller limit, tighter filters, or paginate with start_cursor across multiple calls.`,
	};
};

/** POSTs a request to an Autumn endpoint using the caller's resolved auth. */
export const callAutumn = async ({
	auth,
	endpoint,
	request,
	signal,
}: {
	auth: AutumnMcpAuth;
	endpoint: string;
	request: unknown;
	signal?: AbortSignal | undefined;
}) => {
	const client = createAutumnClient(auth);
	const init: RequestInit = {
		method: "POST",
		headers: client.headers,
		body: JSON.stringify(request),
	};
	if (signal) init.signal = signal;

	const response = await fetch(new URL(endpoint, client.baseUrl), init);
	const text = await response.text();
	const body = text ? parseBody(text) : null;
	if (!response.ok) {
		throw new Error(
			`Autumn API request failed (${response.status}): ${
				typeof body === "string" ? body : JSON.stringify(body)
			}`,
		);
	}
	return guardResponseSize({ body, endpoint, size: text.length });
};

export const callAutumnGet = async ({
	auth,
	endpoint,
	signal,
}: {
	auth: AutumnMcpAuth;
	endpoint: string;
	signal?: AbortSignal | undefined;
}) => {
	const client = createAutumnClient(auth);
	const init: RequestInit = {
		method: "GET",
		headers: client.headers,
	};
	if (signal) init.signal = signal;

	const response = await fetch(new URL(endpoint, client.baseUrl), init);
	const text = await response.text();
	const body = text ? parseBody(text) : null;
	if (!response.ok) {
		throw new Error(
			`Autumn API request failed (${response.status}): ${
				typeof body === "string" ? body : JSON.stringify(body)
			}`,
		);
	}
	return guardResponseSize({ body, endpoint, size: text.length });
};
