import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import type { Context } from "hono";
import { matchRoute } from "../../../honoMiddlewares/middlewareUtils";
import type { HonoEnv } from "../../../honoUtils/HonoEnv";

export enum RateLimitType {
	General = "general",
	Track = "track",
	TrackOrg = "track_org",
	BatchTrack = "batch_track",
	CheckCustomerGet = "check",
	CheckCustomerGetOrg = "check_org",
	Events = "events",
	Attach = "attach",
	ListCustomers = "list_customers",
	EntitiesList = "entities_list",
	CustomerEntitiesGet = "customer_entities_get",
	CustomerEntitiesGetOrg = "entities_get_org",
	Logs = "logs",
}

type RoutePattern = {
	method: string;
	url: string;
};

type RateLimitRouteGroup = {
	type: Exclude<RateLimitType, RateLimitType.General>;
	/** Admin page row name when this group's type also has another route group. */
	name?: string;
	/** "degrade" runs the handler with `ctx.orgRateLimitDegraded` set when the
	 *  bucket's org cap is hit; the default is a 429 from the limiter. */
	overLimit?: "degrade";
	patterns: RoutePattern[];
};

const route = ({ method, url }: RoutePattern): RoutePattern => ({
	method,
	url,
});

export const RATE_LIMIT_ROUTE_GROUPS: RateLimitRouteGroup[] = [
	{
		type: RateLimitType.Attach,
		patterns: [
			// These endpoints shldn't be rate limited
			// route({ method: "POST", url: "/v1/checkout" }),
			// route({ method: "POST", url: "/v1/attach/preview" }),
			// route({ method: "POST", url: "/v1/billing.preview_update" }),
			// route({ method: "POST", url: "/v1/billing.preview_multi_attach" }),
			// route({ method: "POST", url: "/v1/billing.preview_attach" }),

			route({ method: "POST", url: "/v1/cancel" }),
			route({ method: "POST", url: "/v1/setup_payment" }),
			route({ method: "POST", url: "/v1/attach" }),
			route({ method: "POST", url: "/v1/billing.attach" }),
			route({ method: "POST", url: "/v1/billing.multi_attach" }),
			route({ method: "POST", url: "/v1/billing.update" }),

			route({ method: "POST", url: "/v1/billing.setup_payment" }),
			// route({ method: "POST", url: "/v1/billing.open_customer_portal" }),
			route({ method: "POST", url: "/v1/billing.sync_proposals" }),
			route({ method: "POST", url: "/v1/billing.sync_proposals_v2" }),
			route({ method: "POST", url: "/v1/billing.sync" }),
			route({ method: "POST", url: "/v1/billing.sync_v2" }),
			route({ method: "POST", url: "/v1/billing.preview_sync_v2" }),
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
		type: RateLimitType.EntitiesList,
		patterns: [route({ method: "POST", url: "/v1/entities.list" })],
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
		overLimit: "degrade",
		patterns: [
			route({ method: "POST", url: "/v1/events" }),
			route({ method: "POST", url: "/v1/track" }),
			route({ method: "POST", url: "/v1/track_tokens" }),
			route({ method: "POST", url: "/v1/usage" }),
			route({ method: "POST", url: "/v1/balances/update" }),
			route({ method: "POST", url: "/v1/balances.track" }),
			route({ method: "POST", url: "/v1/balances.track_tokens" }),
			route({ method: "POST", url: "/v1/balances.finalize" }),
			route({ method: "POST", url: "/v1/balances.update" }),
		],
	},
	{
		type: RateLimitType.BatchTrack,
		patterns: [
			route({ method: "POST", url: "/v1/balances.batch_track" }),
			route({ method: "POST", url: "/v1/balances.batch_track_tokens" }),
		],
	},
	{
		type: RateLimitType.CheckCustomerGet,
		overLimit: "degrade",
		patterns: [
			route({ method: "POST", url: "/v1/check" }),
			route({ method: "POST", url: "/v1/entitled" }),
			route({ method: "POST", url: "/v1/balances.check" }),
			route({ method: "POST", url: "/v1/customers" }),
			route({ method: "POST", url: "/v1/customers.get_or_create" }),
		],
	},
	// Reads have no DB-free answer, so they share check's counters but reject.
	{
		type: RateLimitType.CheckCustomerGet,
		name: "customer_reads",
		patterns: [
			route({ method: "GET", url: "/v1/customers/:customer_id" }),
			route({
				method: "GET",
				url: "/v1/customers/:customer_id/entities/:entity_id",
			}),
			route({ method: "POST", url: "/v1/customers.get" }),
		],
	},
	{
		type: RateLimitType.CustomerEntitiesGet,
		patterns: [route({ method: "POST", url: "/v1/entities.get" })],
	},
	{
		type: RateLimitType.Logs,
		patterns: [
			route({ method: "POST", url: "/v1/logs.search" }),
			route({ method: "POST", url: "/v1/logs.query" }),
		],
	},
];

export const getRateLimitRouteGroup = (
	c: Context<HonoEnv>,
): { type: RateLimitType; overLimit?: "degrade" } => {
	const method = c.req.method;
	const path = c.req.path;

	for (const { patterns, type, overLimit } of RATE_LIMIT_ROUTE_GROUPS) {
		if (
			patterns.some((pattern) => matchRoute({ url: path, method, pattern }))
		) {
			return { type, overLimit };
		}
	}

	return { type: RateLimitType.General };
};

export enum RateLimitScope {
	Org = "org",
	Customer = "customer",
}

export type RateLimitConfig = {
	limit: number;
	/**
	 * Per-version overrides resolved by GTE bounds — each key is the floor
	 * of its range, and a request maps to the smallest defined key ≥ its
	 * own version. Buckets are scoped by resolved key so two ranges never
	 * share a counter. Base `limit` only applies when no key matches.
	 */
	versionedLimit?: Partial<Record<ApiVersion, number>>;
	windowMs: number;
	scope: RateLimitScope;
	/** "memory" counts per pod, so the real ceiling is limit × pods. */
	store: "memory" | "redis";
	/** Org-wide cap checked before this one; per-customer limits never bind
	 *  for many-customer storms (2026-06-08 incident). */
	orgLimit?: RateLimitType;
};

export const resolveRateLimit = ({
	config,
	apiVersion,
}: {
	config: RateLimitConfig;
	apiVersion?: ApiVersion;
}): { limit: number; matchedKey?: ApiVersion } => {
	if (!config.versionedLimit || !apiVersion) {
		return { limit: config.limit };
	}

	const exact = config.versionedLimit[apiVersion];
	if (exact !== undefined) return { limit: exact, matchedKey: apiVersion };

	const defined = Object.keys(config.versionedLimit)
		.map((v) => new ApiVersionClass(v as ApiVersion))
		.sort((a, b) => (a.lt(b) ? -1 : 1));

	const requested = new ApiVersionClass(apiVersion);
	for (const v of defined) {
		if (requested.lte(v)) {
			const value = config.versionedLimit[v.value as ApiVersion];
			if (value !== undefined) {
				return { limit: value, matchedKey: v.value as ApiVersion };
			}
		}
	}

	return { limit: config.limit };
};

export const RATE_LIMIT_CONFIGS: Record<RateLimitType, RateLimitConfig> = {
	[RateLimitType.General]: {
		limit: process.env.NODE_ENV === "development" ? 1000 : 25,
		windowMs: 1000,
		scope: RateLimitScope.Org,
		store: "redis",
	},
	[RateLimitType.Track]: {
		limit: 10_000,
		windowMs: 1000,
		scope: RateLimitScope.Customer,
		store: "memory",
		orgLimit: RateLimitType.TrackOrg,
	},
	// Org windows are 60s, sized ~1.5-2x the highest legit per-org peak over 7d
	// of prod traffic (check 157k/min, track 60k/min, entities.get 53k/min).
	[RateLimitType.TrackOrg]: {
		limit: 120_000,
		windowMs: 60_000,
		scope: RateLimitScope.Org,
		store: "redis",
	},
	[RateLimitType.BatchTrack]: {
		limit: 10,
		windowMs: 1000,
		scope: RateLimitScope.Org,
		store: "redis",
	},
	[RateLimitType.CheckCustomerGet]: {
		limit: 10_000,
		windowMs: 1000,
		scope: RateLimitScope.Customer,
		store: "memory",
		orgLimit: RateLimitType.CheckCustomerGetOrg,
	},
	[RateLimitType.CheckCustomerGetOrg]: {
		limit: 240_000,
		windowMs: 60_000,
		scope: RateLimitScope.Org,
		store: "redis",
	},
	[RateLimitType.Events]: {
		limit: 5,
		windowMs: 1000,
		scope: RateLimitScope.Customer,
		store: "redis",
	},
	[RateLimitType.Attach]: {
		limit: 30,
		windowMs: 60000,
		scope: RateLimitScope.Customer,
		store: "redis",
	},
	[RateLimitType.ListCustomers]: {
		limit: 5,
		versionedLimit: {
			[ApiVersion.V2_3]: 50,
			[ApiVersion.V2_2]: 5,
		},
		windowMs: 1000,
		scope: RateLimitScope.Org,
		store: "redis",
	},
	[RateLimitType.EntitiesList]: {
		limit: 10,
		windowMs: 1000,
		scope: RateLimitScope.Customer,
		store: "redis",
		orgLimit: RateLimitType.ListCustomers,
	},
	[RateLimitType.CustomerEntitiesGet]: {
		limit: 50,
		windowMs: 1000,
		scope: RateLimitScope.Customer,
		store: "redis",
		orgLimit: RateLimitType.CustomerEntitiesGetOrg,
	},
	[RateLimitType.CustomerEntitiesGetOrg]: {
		limit: 90_000,
		windowMs: 60_000,
		scope: RateLimitScope.Org,
		store: "redis",
	},
	[RateLimitType.Logs]: {
		limit: 10,
		windowMs: 1000,
		scope: RateLimitScope.Org,
		store: "redis",
	},
};
