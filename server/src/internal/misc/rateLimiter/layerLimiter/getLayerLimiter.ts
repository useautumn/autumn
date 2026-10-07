import type { rateLimiter } from "hono-rate-limiter";
import type { RateLimitLayer } from "../policies/types/rateLimitLayer";
import type { RateLimitLayerScope } from "../policies/types/rateLimitLayerScope";
import { createLayerLimiter } from "./createLayerLimiter";

const limitersByLayer = new Map<
	RateLimitLayer,
	ReturnType<typeof rateLimiter>
>();

/** One limiter per layer object, so rows reusing a layer share its per-pod store. */
export const getLayerLimiter = ({
	layer,
	scope,
}: {
	layer: RateLimitLayer;
	scope: RateLimitLayerScope;
}) => {
	const existing = limitersByLayer.get(layer);
	if (existing) return existing;

	const limiter = createLayerLimiter({ layer, scope });
	limitersByLayer.set(layer, limiter);
	return limiter;
};
