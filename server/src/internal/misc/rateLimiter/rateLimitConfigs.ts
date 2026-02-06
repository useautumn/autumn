import type { Context } from "hono";
import { matchRoute } from "../../../honoMiddlewares/middlewareUtils";
import type { HonoEnv } from "../../../honoUtils/HonoEnv";

export enum RateLimitType {
	General = "general",
	Track = "track",
	Check = "check",
	Events = "events",
	Attach = "attach",
	ListProducts = "list_products",
}

export const getRateLimitType = (c: Context<HonoEnv>) => {
	const method = c.req.method;
	const path = c.req.path;

	// Exact match patterns for track endpoints
	const trackPatterns = [
		{
			method: "POST",
			url: "/v1/events",
		},
		{
			method: "POST",
			url: "/v1/track",
		},
	];

	// Patterns for check endpoints (including dynamic customer_id)
	const checkPatterns = [
		{
			method: "POST",
			url: "/v1/check",
		},
		{
			method: "POST",
			url: "/v1/entitled",
		},
	];

	const getCustomerPatterns = [
		{
			method: "GET",
			url: "/v1/customers/:customer_id",
		},
		{
			method: "GET",
			url: "/v1/customers/:customer_id/entities/:entity_id",
		},
		{
			method: "POST",
			url: "/v1/customers",
		},
	];

	const eventsPatterns = [
		{
			method: "POST",
			url: "/v1/events/list",
		},
		{
			method: "POST",
			url: "/v1/events/aggregate",
		},
		{
			method: "POST",
			url: "/v1/query",
		},
	];

	const attachPatterns = [
		{
			method: "POST",
			url: "/v1/attach",
		},
	];

	const listProductsPatterns = [
		{
			method: "GET",
			url: "/v1/products",
		},
		{
			method: "GET",
			url: "/v1/products_beta",
		},
		{
			method: "GET",
			url: "/v1/plans",
		},
	];

	const patternMap: {
		patterns: { method: string; url: string }[];
		type: RateLimitType;
	}[] = [
		{ patterns: listProductsPatterns, type: RateLimitType.ListProducts },
		{ patterns: attachPatterns, type: RateLimitType.Attach },
		{ patterns: trackPatterns, type: RateLimitType.Track },
		{
			patterns: checkPatterns.concat(getCustomerPatterns),
			type: RateLimitType.Check,
		},
		{ patterns: eventsPatterns, type: RateLimitType.Events },
	];

	for (const { patterns, type } of patternMap) {
		if (
			patterns.some((pattern) => matchRoute({ url: path, method, pattern }))
		) {
			return type;
		}
	}

	return RateLimitType.General;
};

export enum RateLimitScope {
	Org = "org",
	Customer = "customer",
	CustomerWithUrlFallback = "customer_with_url_fallback", // Check endpoint: tries body first, then URL param
}

export type RateLimitConfig = {
	name: string;
	limit: number;
	windowMs: number;
	notInRedis: boolean;
	scope: RateLimitScope;
};

export const RATE_LIMIT_CONFIGS: Record<RateLimitType, RateLimitConfig> = {
	[RateLimitType.General]: {
		name: "general",
		limit: 1000,
		windowMs: 1000,
		notInRedis: false,
		scope: RateLimitScope.Org,
	},
	[RateLimitType.Track]: {
		name: "track",
		limit: 10000,
		windowMs: 1000,
		notInRedis: true,
		scope: RateLimitScope.Customer,
	},
	[RateLimitType.Check]: {
		name: "check",
		limit: 10000,
		windowMs: 1000,
		notInRedis: true,
		scope: RateLimitScope.CustomerWithUrlFallback,
	},
	[RateLimitType.Events]: {
		name: "events",
		limit: 5,
		windowMs: 1000,
		notInRedis: false,
		scope: RateLimitScope.Customer,
	},
	[RateLimitType.Attach]: {
		name: "attach",
		limit: 5,
		windowMs: 60000,
		notInRedis: false,
		scope: RateLimitScope.Customer,
	},
	[RateLimitType.ListProducts]: {
		name: "list_products",
		limit: 20,
		windowMs: 1000,
		notInRedis: false,
		scope: RateLimitScope.Org,
	},
};
