/**
 * Svix Play API client for webhook testing.
 * Uses the free Svix Play API - no signup required.
 *
 * API Docs: https://docs.svix.com/play#programmatic-use-of-the-public-api
 */

const SVIX_PLAY_API_BASE = "https://api.play.svix.com/api/v1";

export type SvixPlayEvent = {
	id: string;
	url: string;
	method: string;
	created_at: string;
	body: string; // base64 encoded
	headers: Record<string, string>;
	response: {
		status_code: number;
		headers: Record<string, string>;
		body: string;
	};
	ip: string | null;
};

export type SvixPlayHistory = {
	iterator: string;
	data: SvixPlayEvent[];
};

/**
 * Generate a new Svix Play token for webhook testing.
 * Tokens are freely generated and don't require authentication.
 */
export const generatePlayToken = async (): Promise<string> => {
	const response = await fetch(`${SVIX_PLAY_API_BASE}/token/generate/`, {
		method: "POST",
	});

	if (!response.ok) {
		throw new Error(`Failed to generate Svix Play token: ${response.status}`);
	}

	const data = (await response.json()) as { token: string };
	return data.token;
};

/**
 * Get the webhook URL for a given Svix Play token.
 * This URL receives webhooks and stores them for later inspection.
 */
export const getPlayWebhookUrl = (token: string): string => {
	return `${SVIX_PLAY_API_BASE}/in/${token}/`;
};

/**
 * Query the webhook history for a Svix Play token.
 * Returns all webhooks received by this token.
 */
export const getPlayHistory = async ({
	token,
	iterator,
}: {
	token: string;
	iterator?: string;
}): Promise<SvixPlayHistory> => {
	const url = new URL(`${SVIX_PLAY_API_BASE}/history/${token}/`);
	if (iterator) {
		url.searchParams.set("iterator", iterator);
	}

	const response = await fetch(url.toString());

	if (!response.ok) {
		throw new Error(`Failed to get Svix Play history: ${response.status}`);
	}

	return response.json() as Promise<SvixPlayHistory>;
};

/**
 * Parse a Svix Play event body (base64 → JSON).
 */
export const parseEventBody = <T = unknown>(event: SvixPlayEvent): T => {
	const decoded = Buffer.from(event.body, "base64").toString("utf-8");
	return JSON.parse(decoded) as T;
};

/**
 * Wait for a webhook matching a predicate to appear in Svix Play.
 * Polls every 500ms until timeout.
 */
export const waitForWebhook = async <T = unknown>({
	token,
	predicate,
	timeoutMs = 10000,
}: {
	token: string;
	predicate: (payload: T) => boolean;
	timeoutMs?: number;
}): Promise<{ event: SvixPlayEvent; payload: T } | null> => {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const history = await getPlayHistory({ token });

		for (const event of history.data) {
			try {
				const payload = parseEventBody<T>(event);
				if (predicate(payload)) {
					return { event, payload };
				}
			} catch {
				// Skip events that can't be parsed
			}
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	return null;
};
