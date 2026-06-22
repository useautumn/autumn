import type { TokenPools } from "./usage.js";

export type TrackTokensParams = TokenPools & {
	customerId: string;
	modelId: string;
	featureId?: string;
	entityId?: string;
	properties?: Record<string, unknown>;
};

/** Tracking options every adapter shares. */
export type AutumnTrackingOptions = {
	/**
	 * Autumn SDK client instance. When omitted, a minimal fetch client is
	 * created from AUTUMN_API_KEY (or AUTUMN_SECRET_KEY).
	 */
	autumn?: AutumnClient;
	/** The Autumn customer ID to attribute usage to. */
	customerId: string;
	/** Target a specific AI credit system feature. Auto-detected if omitted. */
	featureId?: string;
	/** Entity ID for entity-scoped balance tracking. */
	entityId?: string;
	/** Additional properties to attach to each usage event. */
	properties?: Record<string, unknown>;
};

export type TrackedEvent = {
	pools: TokenPools;
	modelId: string;
	/** Overrides the options-level properties when set. */
	properties?: Record<string, unknown>;
};

/**
 * Structural view of the Autumn SDK client. @useautumn/sdk exposes
 * trackTokens at the client root; balances.trackTokens is accepted for
 * clients that namespace it. `balances` stays `unknown` so SDK namespace
 * classes without trackTokens still satisfy the type. Older clients may
 * ship neither shape.
 */
export type AutumnClient = {
	trackTokens?: (params: TrackTokensParams) => Promise<unknown>;
	balances?: unknown;
};

type TrackTokensCarrier = {
	trackTokens?: (params: TrackTokensParams) => Promise<unknown>;
};

/** Wire keys for the fallback fetch client — mirrors the SDK's outbound mapping. */
const WIRE_KEYS: Record<string, string> = {
	customerId: "customer_id",
	entityId: "entity_id",
	featureId: "feature_id",
	modelId: "model_id",
	inputTokens: "input_tokens",
	outputTokens: "output_tokens",
	cacheReadTokens: "cache_read_tokens",
	cacheWriteTokens: "cache_write_tokens",
	audioInputTokens: "audio_input_tokens",
	audioOutputTokens: "audio_output_tokens",
	reasoningTokens: "reasoning_tokens",
};

const toWire = (params: TrackTokensParams) =>
	Object.fromEntries(
		Object.entries(params)
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => [WIRE_KEYS[key] ?? key, value]),
	);

/** Minimal fetch client for POST /v1/balances.track_tokens, keyed from env. */
const envClient = (): AutumnClient => {
	const env = typeof process === "undefined" ? undefined : process.env;
	const secretKey = env?.AUTUMN_API_KEY ?? env?.AUTUMN_SECRET_KEY;
	// Optional override; virtually everyone is on the default
	const baseUrl = env?.AUTUMN_BASE_URL ?? "https://api.useautumn.com";

	return {
		trackTokens: async (params: TrackTokensParams) => {
			// Thrown here so the miss flows through the usual swallow-and-log path
			if (!secretKey) {
				throw new Error(
					"[Autumn] No autumn client was passed and AUTUMN_API_KEY is not set.",
				);
			}
			const response = await fetch(`${baseUrl}/v1/balances.track_tokens`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${secretKey}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(toWire(params)),
			});
			if (!response.ok) {
				throw new Error(
					`track_tokens failed (${response.status}): ${await response.text()}`,
				);
			}
			return response.json();
		},
	};
};

/**
 * Binds tracking options once; each call resolves its event lazily inside
 * trackTokenUsage so resolution errors are swallowed with the rest.
 */
export const createTracker = ({
	autumn = envClient(),
	customerId,
	featureId,
	entityId,
	properties,
}: AutumnTrackingOptions) =>
	(getEvent: () => TrackedEvent): Promise<void> =>
		trackTokenUsage({
			autumn,
			getParams: () => {
				const event = getEvent();
				return {
					...event.pools,
					customerId,
					modelId: event.modelId,
					featureId,
					entityId,
					properties: event.properties ?? properties,
				};
			},
		});

/** Tracking failures (including getParams throwing) are logged, never thrown into the AI response path. */
export const trackTokenUsage = async ({
	autumn,
	getParams,
}: {
	autumn: AutumnClient;
	getParams: () => TrackTokensParams;
}): Promise<void> => {
	try {
		// Bind so class-based SDK clients keep their `this` when invoked.
		const balances = autumn.balances as TrackTokensCarrier | undefined;
		const trackTokens =
			balances?.trackTokens?.bind(balances) ?? autumn.trackTokens?.bind(autumn);
		if (!trackTokens) {
			throw new Error(
				"Autumn client does not support trackTokens — upgrade @useautumn/sdk.",
			);
		}
		await trackTokens(getParams());
	} catch (error) {
		console.error("[Autumn Tracking] Failed to track usage:", error);
	}
};
