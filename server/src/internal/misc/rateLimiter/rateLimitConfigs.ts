import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import type { Context } from "hono";
import { matchRoute } from "../../../honoMiddlewares/middlewareUtils";
import type { HonoEnv } from "../../../honoUtils/HonoEnv";

export enum RateLimitType {
	General = "general",
	Track = "track",
	BatchTrack = "batch_track",
	Check = "check",
	Events = "events",
	Attach = "attach",
	ListCustomers = "list_customers",
	CustomerEntitiesGet = "customer_entities_get",
	Logs = "logs",
	TrackOrg = "track_org",
	CheckOrg = "check_org",
	EntitiesGetOrg = "entities_get_org",
}

// Org-wide aggregate caps summed across all of an org's customers — the
// per-customer limits never bind for many-customer storms (2026-06-08 incident).
const ORG_AGGREGATE_TYPES: Partial<Record<RateLimitType, RateLimitType>> = {
	[RateLimitType.Track]: RateLimitType.TrackOrg,
	[RateLimitType.Check]: RateLimitType.CheckOrg,
	[RateLimitType.CustomerEntitiesGet]: RateLimitType.EntitiesGetOrg,
};

export const getOrgAggregateType = (
	type: RateLimitType,
): RateLimitType | undefined => ORG_AGGREGATE_TYPES[type];

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
		],
	},
	{
		type: RateLimitType.ListCustomers,
		patterns: [
			route({ method: "GET", url: "/v1/customers" }),
			route({ method: "POST", url: "/v1/customers/list" }),
			route({ method: "POST", url: "/v1/customers.list" }),
			route({ method: "POST", url: "/v1/entities.list" }),
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
			route({ method: "POST", url: "/v1/customers.get" }),
			route({ method: "POST", url: "/v1/customers.get_or_create" }),
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

// Check-group routes that can fail open (allowed: true) when an org is over
// its aggregate cap; the establish routes in the group shed a 503 instead.
const CHECK_FAIL_OPEN_PATTERNS: RoutePattern[] = [
	route({ method: "POST", url: "/v1/check" }),
	route({ method: "POST", url: "/v1/entitled" }),
	route({ method: "POST", url: "/v1/balances.check" }),
];

export const isCheckFailOpenRoute = (c: Context<HonoEnv>): boolean => {
	const method = c.req.method;
	const path = c.req.path;
	return CHECK_FAIL_OPEN_PATTERNS.some((pattern) =>
		matchRoute({ url: path, method, pattern }),
	);
};

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
	/**
	 * Per-version overrides resolved by GTE bounds — each key is the floor
	 * of its range, and a request maps to the smallest defined key ≥ its
	 * own version. Buckets are scoped by resolved key so two ranges never
	 * share a counter. Base `limit` only applies when no key matches.
	 */
	versionedLimit?: Partial<Record<ApiVersion, number>>;
	windowMs: number;
	notInRedis: boolean;
	scope: RateLimitScope;
	// "degrade" preserves check/track traffic through fallback paths.
	// Establish routes still reject with 429.
	overLimit?: "reject" | "degrade";
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
	[RateLimitType.BatchTrack]: {
		name: "batch_track",
		limit: 10,
		windowMs: 1000,
		notInRedis: false,
		scope: RateLimitScope.Org,
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
		limit: 30,
		windowMs: 60000,
		notInRedis: false,
		scope: RateLimitScope.Customer,
	},
	[RateLimitType.ListCustomers]: {
		name: "list_customers",
		limit: 5,
		versionedLimit: {
			[ApiVersion.V2_3]: 50,
			[ApiVersion.V2_2]: 5,
		},
		windowMs: 1000,
		notInRedis: false,
		scope: RateLimitScope.Org,
	},
	[RateLimitType.CustomerEntitiesGet]: {
		name: "customer_entities_get",
		limit: 50,
		windowMs: 1000,
		notInRedis: false,
		scope: RateLimitScope.Customer,
	},
	[RateLimitType.Logs]: {
		name: "logs",
		limit: 10,
		windowMs: 1000,
		notInRedis: false,
		scope: RateLimitScope.Org,
	},
	// 60s windows sized ~1.5-2x the highest legit per-org peak observed over 7d
	// of prod traffic (check 157k/min, track 60k/min, entities.get 53k/min).
	[RateLimitType.TrackOrg]: {
		name: "track_org",
		limit: 120_000,
		windowMs: 60_000,
		notInRedis: false,
		scope: RateLimitScope.Org,
		overLimit: "degrade",
	},
	[RateLimitType.CheckOrg]: {
		name: "check_org",
		limit: 240_000,
		windowMs: 60_000,
		notInRedis: false,
		scope: RateLimitScope.Org,
		overLimit: "degrade",
	},
	[RateLimitType.EntitiesGetOrg]: {
		name: "entities_get_org",
		limit: 90_000,
		windowMs: 60_000,
		notInRedis: false,
		scope: RateLimitScope.Org,
	},
};
