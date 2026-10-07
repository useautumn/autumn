import type { ApiVersion } from "@autumn/shared";
import { RATE_LIMIT_CONFIGS, type RateLimitType } from "../rateLimitConfigs";
import { toRateLimitKey } from "../rateLimitFactory";
import type { RateLimitLayerSummary } from "./types/rateLimitLayerSummary";

const KEY_PLACEHOLDERS = {
	org: { id: "{orgId}" },
	env: "{env}",
	customerId: "{customerId}",
};

export const toRateLimitLayerSummary = ({
	type,
	overLimit = "reject",
}: {
	type: RateLimitType;
	overLimit?: RateLimitLayerSummary["overLimit"];
}): RateLimitLayerSummary => {
	const config = RATE_LIMIT_CONFIGS[type];
	const versionLimits = Object.entries(config.versionedLimit ?? {}).map(
		([upTo, limit]) => ({
			upTo: upTo as ApiVersion,
			limit,
			key: toRateLimitKey({
				ctx: { ...KEY_PLACEHOLDERS, apiVersion: { value: upTo as ApiVersion } },
				rateLimitType: type,
			}),
		}),
	);

	return {
		name: type,
		limit: config.limit,
		versionLimits,
		windowMs: config.windowMs,
		store: config.store,
		overLimit,
		key: toRateLimitKey({ ctx: KEY_PLACEHOLDERS, rateLimitType: type }),
	};
};
