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
	return body;
};
