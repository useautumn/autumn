import type { TokenPools } from "./usage.js";

export type TrackTokensParams = TokenPools & {
	customerId: string;
	modelId: string;
	featureId?: string;
	entityId?: string;
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
