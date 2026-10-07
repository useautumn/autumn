import { RATE_LIMIT_POLICIES } from "./rateLimitPolicies";
import type { RateLimitLayer } from "./types/rateLimitLayer";
import type { RateLimitLayerScope } from "./types/rateLimitLayerScope";

type RateLimitDefault = { limit: number; windowMs: number; scope: string };

// Historical admin labels; check reads its customer from the body, then the URL.
const toScopeLabel = ({
	layer,
	scope,
}: {
	layer: RateLimitLayer;
	scope: RateLimitLayerScope;
}) => {
	if (scope === "perOrg") return "org";
	return layer.name === "check" ? "customer_with_url_fallback" : "customer";
};

const toRateLimitDefault = ({
	layer,
	scope,
}: {
	layer: RateLimitLayer;
	scope: RateLimitLayerScope;
}): RateLimitDefault => ({
	limit: typeof layer.limit === "number" ? layer.limit : layer.limit.otherwise,
	windowMs: layer.windowMs,
	scope: toScopeLabel({ layer, scope }),
});

/** Default limit per layer name, i.e. per counter and S3 override key. */
export const listRateLimitDefaults = (): Record<string, RateLimitDefault> => {
	const defaults: Record<string, RateLimitDefault> = {};
	for (const { perOrg, perCustomer } of RATE_LIMIT_POLICIES) {
		if (perOrg) {
			defaults[perOrg.name] ??= toRateLimitDefault({
				layer: perOrg,
				scope: "perOrg",
			});
		}
		if (perCustomer) {
			defaults[perCustomer.name] ??= toRateLimitDefault({
				layer: perCustomer,
				scope: "perCustomer",
			});
		}
	}
	return defaults;
};
