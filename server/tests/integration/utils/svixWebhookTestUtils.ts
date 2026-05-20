/**
 * Shared Svix webhook test utilities.
 *
 * Consolidates Svix Play client + endpoint management into one module
 * so every webhook test file doesn't have to duplicate boilerplate.
 */

import { Svix } from "svix";

// ─── Svix Admin Client ───────────────────────────────────────────────────────

let svixClient: Svix | null = null;

const getSvixClient = (): Svix => {
	if (!svixClient) {
		const apiKey = process.env.SVIX_API_KEY;
		if (!apiKey)
			throw new Error(
				"SVIX_API_KEY environment variable is required for webhook tests",
			);
		svixClient = new Svix(apiKey);
	}
	return svixClient;
};

// ─── Svix Play Client ───────────────────────────────────────────────────────

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

export const generatePlayToken = async (): Promise<string> => {
	const response = await fetch(`${SVIX_PLAY_API_BASE}/token/generate/`, {
		method: "POST",
	});

	if (!response.ok)
		throw new Error(`Failed to generate Svix Play token: ${response.status}`);

	const data = (await response.json()) as { token: string };
	return data.token;
};

export const getPlayWebhookUrl = (token: string): string => {
	return `${SVIX_PLAY_API_BASE}/in/${token}/`;
};

export const getPlayHistory = async ({
	token,
	iterator,
}: {
	token: string;
	iterator?: string;
}): Promise<SvixPlayHistory> => {
	const url = new URL(`${SVIX_PLAY_API_BASE}/history/${token}/`);
	if (iterator) url.searchParams.set("iterator", iterator);

	const response = await fetch(url.toString());

	if (!response.ok)
		throw new Error(`Failed to get Svix Play history: ${response.status}`);

	return response.json() as Promise<SvixPlayHistory>;
};

export const parseEventBody = <T = unknown>(event: SvixPlayEvent): T => {
	const decoded = Buffer.from(event.body, "base64").toString("utf-8");
	return JSON.parse(decoded) as T;
};

/**
 * Poll Svix Play until a webhook matching `predicate` appears, or timeout.
 *
 * When `logWebhook` is true (default), the matched payload is pretty-printed
 * to stdout — useful for eyeballing webhook shapes during local test runs.
 * Set to false to suppress (e.g., in CI).
 */
export const waitForWebhook = async <T = unknown>({
	token,
	predicate,
	timeoutMs = 10000,
	logWebhook = true,
}: {
	token: string;
	predicate: (payload: T) => boolean;
	timeoutMs?: number;
	logWebhook?: boolean;
}): Promise<{ event: SvixPlayEvent; payload: T } | null> => {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const history = await getPlayHistory({ token });

		for (const event of history.data) {
			try {
				const payload = parseEventBody<T>(event);
				if (predicate(payload)) {
					if (logWebhook) {
						process.stdout.write("\n── webhook ────────────────────────\n");
						process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
					}
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

// ─── Event Type Registration ───────────────────────────────────────────────

/**
 * Idempotently registers an event type. Svix requires event types referenced
 * in `filterTypes` to be pre-registered at the org level; without this the
 * endpoint.create call fails with HTTP 422.
 *
 * Catches "already exists" (409) errors so this can be called every test run.
 */
export const ensureSvixEventType = async (name: string): Promise<void> => {
	const svix = getSvixClient();
	try {
		await svix.eventType.create({
			name,
			description: `Auto-registered by integration tests: ${name}`,
		});
	} catch (error) {
		const status = (error as { code?: number })?.code;
		if (status === 409 || status === 400) return;
		throw error;
	}
};

// ─── Endpoint Lifecycle ─────────────────────────────────────────────────────

export const createWebhookTestEndpoint = async ({
	appId,
	playUrl,
	filterTypes,
}: {
	appId: string;
	playUrl: string;
	filterTypes: string[];
}): Promise<string> => {
	const svix = getSvixClient();

	const endpoint = await svix.endpoint.create(appId, {
		url: playUrl,
		description: "Test endpoint for webhook integration tests",
		filterTypes,
	});

	return endpoint.id;
};

export const deleteWebhookTestEndpoint = async ({
	appId,
	endpointId,
}: {
	appId: string;
	endpointId: string;
}): Promise<void> => {
	const svix = getSvixClient();

	try {
		await svix.endpoint.delete(appId, endpointId);
	} catch (error) {
		console.warn(`Failed to delete test endpoint ${endpointId}:`, error);
	}
};

// ─── High-Level Setup Helper ────────────────────────────────────────────────

export type WebhookTestSetup = {
	playToken: string;
	endpointId: string;
	cleanup: () => Promise<void>;
};

/**
 * Full lifecycle helper: generates a Svix Play token, creates a filtered
 * endpoint in the given app, and returns everything needed for tests +
 * a `cleanup` function for `afterAll`.
 */
export const setupWebhookTest = async ({
	appId,
	filterTypes,
}: {
	appId: string;
	filterTypes: string[];
}): Promise<WebhookTestSetup> => {
	// Ensure every filter type is registered in Svix before creating the
	// endpoint, otherwise endpoint.create fails with HTTP 422.
	for (const eventType of filterTypes) {
		await ensureSvixEventType(eventType);
	}

	const playToken = await generatePlayToken();
	console.log(`Generated Svix Play token: ${playToken}`);

	const playUrl = getPlayWebhookUrl(playToken);
	console.log(`Creating Svix endpoint: ${playUrl}`);

	const endpointId = await createWebhookTestEndpoint({
		appId,
		playUrl,
		filterTypes,
	});
	console.log(`Created Svix endpoint: ${endpointId}`);

	const cleanup = async () => {
		await deleteWebhookTestEndpoint({ appId, endpointId });
		console.log(`Deleted Svix endpoint: ${endpointId}`);
	};

	return { playToken, endpointId, cleanup };
};

/**
 * Resolves the org's Svix sandbox app ID or throws a clear error.
 * Keeps the guard-clause out of every test file.
 */
export const getTestSvixAppId = ({
	svixConfig,
}: {
	svixConfig?: { sandbox_app_id?: string } | null;
}): string => {
	const appId = svixConfig?.sandbox_app_id;
	if (!appId)
		throw new Error(
			"Test org does not have svix_config.sandbox_app_id configured. " +
				"Cannot run webhook integration tests without Svix app.",
		);
	return appId;
};
