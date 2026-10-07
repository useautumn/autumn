import type { RateLimitLayer } from "./types/rateLimitLayer";
import type { RateLimitRoute } from "./types/rateLimitRoute";

type LayerWindow = Pick<RateLimitLayer, "limit" | "windowMs">;

/** `route("POST /v1/attach")` */
export const route = (spec: string): RateLimitRoute => {
	const [method, url] = spec.split(" ");
	return { method, url };
};

export const perSecond = (limit: RateLimitLayer["limit"]): LayerWindow => ({
	limit,
	windowMs: 1000,
});

export const perMinute = (limit: RateLimitLayer["limit"]): LayerWindow => ({
	limit,
	windowMs: 60_000,
});
