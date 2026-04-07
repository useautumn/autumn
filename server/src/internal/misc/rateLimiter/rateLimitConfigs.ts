import type { Context } from "hono";
import { matchRoute } from "../../../honoMiddlewares/middlewareUtils";
import type { HonoEnv } from "../../../honoUtils/HonoEnv";

export enum RateLimitType {
	General = "general",
	Track = "track",
	Check = "check",
	Events = "events",
	Attach = "attach",
	ListCustomers = "list_customers",
}

type RoutePattern = {
	method: string;
	url: string;
};

type RateLimitRouteGroup = {
	type: Exclude<RateLimitType, RateLimitType.General>;
	patterns: RoutePattern[];
};

const route = ({ method, url }: RoutePattern): RoutePattern => ({
	method,
	url,
});

const RATE_LIMIT_ROUTE_GROUPS: RateLimitRouteGroup[] = [
	{
		type: RateLimitType.Attach,
		patterns: [
			route({ method: "POST", url: "/v1/attach/preview" }),
			route({ method: "POST", url: "/v1/cancel" }),
			route({ method: "POST", url: "/v1/setup_payment" }),
			route({ method: "POST", url: "/v1/checkout" }),
			route({ method: "POST", url: "/v1/attach" }),
			route({ method: "POST", url: "/v1/billing.attach" }),
			route({ method: "POST", url: "/v1/billing.multi_attach" }),
			route({ method: "POST", url: "/v1/billing.update" }),

			route({ method: "POST", url: "/v1/billing.preview_update" }),
			route({ method: "POST", url: "/v1/billing.preview_multi_attach" }),
			route({ method: "POST", url: "/v1/billing.preview_attach" }),
			route({ method: "POST", url: "/v1/billing.setup_payment" }),
			route({ method: "POST", url: "/v1/billing.open_customer_portal" }),
			route({ method: "POST", url: "/v1/billing.sync_proposals" }),
			route({ method: "POST", url: "/v1/billing.sync" }),
		],
	},
	{
		type: RateLimitType.ListCustomers,
		patterns: [
			route({ method: "GET", url: "/v1/customers" }),
			route({ method: "POST", url: "/v1/customers/list" }),
			route({ method: "POST", url: "/v1/customers.list" }),
		],
	},
	{
		type: RateLimitType.Events,
		patterns: [
			route({ method: "POST", url: "/v1/events/list" }),
			route({ method: "POST", url: "/v1/events/aggregate" }),
			route({ method: "POST", url: "/v1/query" }),
			route({ method: "POST", url: "/v1/events.list" }),
			route({ method: "POST", url: "/v1/events.aggregate" }),
		],
	},
	{
		type: RateLimitType.Track,
		patterns: [
			route({ method: "POST", url: "/v1/events" }),
			route({ method: "POST", url: "/v1/track" }),
			route({ method: "POST", url: "/v1/usage" }),
			route({ method: "POST", url: "/v1/balances/update" }),
			route({ method: "POST", url: "/v1/balances.track" }),
			route({ method: "POST", url: "/v1/balances.finalize" }),
			route({ method: "POST", url: "/v1/balances.update" }),
		],
	},
	{
		type: RateLimitType.Check,
		patterns: [
			route({ method: "POST", url: "/v1/check" }),
			route({ method: "POST", url: "/v1/entitled" }),
			route({ method: "POST", url: "/v1/balances.check" }),
			route({ method: "GET", url: "/v1/customers/:customer_id" }),
			route({
				method: "GET",
				url: "/v1/customers/:customer_id/entities/:entity_id",
			}),
			route({ method: "POST", url: "/v1/customers" }),
			route({ method: "POST", url: "/v1/customers.get_or_create" }),
			route({ method: "POST", url: "/v1/entities.get" }),
		],
	},
];

export const getRateLimitType = (c: Context<HonoEnv>) => {
	const method = c.req.method;
	const path = c.req.path;

	for (const { patterns, type } of RATE_LIMIT_ROUTE_GROUPS) {
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
		limit: process.env.NODE_ENV === "development" ? 1000 : 25,
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
	[RateLimitType.ListCustomers]: {
		name: "list_customers",
		limit: 1,
		windowMs: 1000,
		notInRedis: false,
		scope: RateLimitScope.Org,
	},
};
